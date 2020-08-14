// Extend the Enketo Core Form class, and expose it for local testing.
import { Form, FormModel } from 'enketo-core';
import $ from 'jquery';
import gui from './gui';
import settings from './settings';
import events from 'enketo-core/src/js/event';
import config from 'enketo/config';
import './relevant';
import './required';
import './page';
import './repeat';
import './input';

/**
 * This function doesn't actually evaluate constraints. It triggers
 * an event on nodes that have constraint dependency on the changed node(s).
 * This event is used in the discrepancy notes widget.
 *
 * @param  {[type]} updated - [description]
 */
const constraintUpdate = function( updated ) {
    updated = updated || {};
    // If the update object is a repeat node (cloned=true), do nothing
    if ( !updated.cloned ) {
        this.getRelatedNodes( 'data-constraint', '', updated )
        // The filter below is commented out, because at the moment this.getRelatedNodes already takes
        // care of this (in enketo-core). However, it is not unrealistic to expect that in the future we will
        // not be able to rely on that as it may be considered a performance hack too far. In that case, uncomment below.
        //
        // Filter out the nodes that are inside a repeat instance other than
        // the repeat instance that contains the node that triggered the dataupdate
        // https://github.com/kobotoolbox/enketo-express/issues/741
            /*.filter( function() {
                var $input;
                var $repeat;
                var repeatIndex;
                if ( !updated.repeatPath ) {
                    return true;
                }
                $input = $( this );
                $repeat = $input.closest( '.or-repeat[name="' + updated.repeatPath + '"]' );
                if ( !$repeat.length ) {
                    return true;
                }
                repeatIndex = $( '.or-repeat[name="' + updated.repeatPath + '"]' ).index( $repeat );
                return repeatIndex === updated.repeatIndex;
            } )*/
            .trigger( 'constraintevaluated.oc', updated );
    }
};

/**
 * OC does not empty irrelevant nodes. Instead non-empty irrelevant nodes get an error until the user clears the value.
 * This function takes care of re-evaluating the branch when the value is cleared.
 *
 * @param  {[type]} updated - [description]
 * @return {[type]}         [description]
 */
const relevantErrorUpdate = function( updated ) {
    let $nodes;

    $nodes = this.getRelatedNodes( 'name', '[data-relevant]', updated )
        .closest( '.invalid-relevant' )
        .map( function() {
            return $( this ).is( '[data-relevant]' ) ? this : this.querySelector( '[data-relevant]' );
        } );

    this.relevant.updateNodes( $nodes );
};

const originalInit = Form.prototype.init;
const originalValidateInput = Form.prototype.validateInput;

Form.prototype.evaluationCascadeAdditions = [ constraintUpdate, relevantErrorUpdate ];

Form.prototype.init = function() {
    const that = this;
    let initialized = false;

    // Before any other change handlers, add the "strict check" handlers
    if ( settings.strictViolationSelector ) {
        this.view.$
            .on( 'change.file',
                'input:not(.ignore)[data-required][data-oc-required-type="strict"], select:not(.ignore)[data-required][data-oc-required-type="strict"], textarea:not(.ignore)[data-required][data-oc-required-type="strict"]',
                function( evt ) {
                    if ( initialized ) {
                        that.strictRequiredCheckHandler( evt, this );
                    }
                } )
            .on( 'change.file',
                'input:not(.ignore)[data-constraint][data-oc-constraint-type="strict"], select:not(.ignore)[data-constraint][data-oc-constraint-type="strict"], textarea:not(.ignore)[data-constraint][data-oc-constraint-type="strict"]',
                function( evt ) {
                    if ( initialized ) {
                        that.strictConstraintCheckHandler( evt, this );
                    }
                } );
    }

    const loadErrors = originalInit.call( this );


    initialized = true;

    return loadErrors;
};

Form.prototype.specialOcLoadValidate = function( includeRequired ) {
    const that = this;
    let $collectionToValidate = this.getRelatedNodes( 'data-constraint' );

    if ( includeRequired ) {
        $collectionToValidate = $collectionToValidate.add( this.getRelatedNodes( 'data-required' ) );
    }

    // Note, even if includeRequired is falsy, any empty question that has both a required and constraint expression
    // will show a required error.
    // So the above collection determining is just to limit the amount of validation the engine has to perform but it
    // still needs cleaning, because the engine will validate **all** expressions on the selected question.

    $collectionToValidate.each( function() {
        const control = this;
        that.validateInput( control )
            .then( passed => {
                if ( !passed && !includeRequired ) {
                    // Undo the displaying of a required error message upon load.
                    // Note: a failed required means there cannot be a failed constraint, because they are mutually exclusive
                    // in the engine (constraint is only evaluated if question has a value).
                    that.setValid( control, 'required' );
                }
            } );
    } );
};


/**
 * Skip constraint (and required) validation if question is currently marked with "invalid-relevant" error.
 *
 * @param {[type]} $input - [description]
 * @param control
 * @return {[type]}        [description]
 */
Form.prototype.validateInput = function( control ) {
    const that = this;

    // There is a condition where a value change results in both an invalid-relevant and invalid-constraint,
    // where the invalid constraint is added *after* the invalid-relevant. I can reproduce in automated test (not manually).
    // It is probably related due to the asynchronicity of the constraint evaluation.
    //
    // To crudely resolve this, we remove any constraint error here.
    // However we do want some of the other things that validateInput does (ie. updating the required "*" visibility), so
    // we will still run it but then remove any invalid classes.
    //
    // This is very unfortunate, but these are the kind of acrobatics that are necessary to "fight" the built-in behavior of Enketo's form engine.
    return originalValidateInput.call( this, control )
        .then( passed => {
            if ( !passed ) {
                const question = control.closest( '.question' );
                if ( question && question.classList.contains( 'invalid-relevant' ) ) {
                    that.setValid( control, 'constraint' );
                }
            }

            return passed;
        } );
};


Form.prototype.strictRequiredCheckHandler = function( evt, input ) {
    const that = this;
    const n = {
        path: this.input.getName( input ),
        required: this.input.getRequired( input ),
        val: this.input.getVal( input )
    };

    // No need to validate.
    if ( n.readonly || n.inputType === 'hidden' || input.closest( '.invalid-relevant' ) ) {
        return;
    }

    // Only now, will we determine the index (expensive).
    n.ind = this.input.getIndex( input );

    // Check required
    if ( n.val === '' && this.model.node( n.path, n.ind ).isRequired( n.required ) ) {
        const question = input.closest( '.question' );
        const msg = question.querySelector( '.or-required-msg.active' ).innerHTML;
        gui.alertStrictError( msg );
        // Cancel propagation input
        evt.stopImmediatePropagation();
        const currentModelValue = that.model.node( n.path, n.ind ).getVal();
        that.input.setVal( input, currentModelValue );
        // When changing this make sure that the radio picker's change
        // listener picks this event up.
        // https://github.com/OpenClinica/enketo-express-oc/issues/168
        input.dispatchEvent( events.InputUpdate() );
        question.scrollIntoView();
    }
};

Form.prototype.strictConstraintCheckHandler = function( evt, input ) {
    const that = this;
    const n = {
        path: this.input.getName( input ),
        xmlType: this.input.getXmlType( input ),
        constraint: this.input.getConstraint( input ),
        val: this.input.getVal( input )
    };

    // No need to validate.
    if ( n.readonly || n.inputType === 'hidden' || input.closest( '.invalid-relevant' ) ) {
        return;
    }

    // Only now, will we determine the index (expensive).
    n.ind = this.input.getIndex( input );

    // In order to evaluate the constraint, its value has to be set in the model.
    // This would trigger a fieldsubmission, which is what we're trying to prevent.
    // A heavy-handed dumb-but-safe approach is to clone the model and set the value there.
    const modelClone = new FormModel( new XMLSerializer().serializeToString( this.model.xml ) );
    // TODO: initialize clone with **external data**.
    modelClone.init();
    // Set the value in the clone
    const updated = modelClone.node( n.path, n.ind ).setVal( n.val, n.xmlType );
    // Check if strict constraint passes
    if ( !updated ) {
        return;
    }
    // Note: we don't use Enketo Core's nodeset.validateConstraintAndType here because it's asynchronous,
    // which means we couldn't selectively stop event propagation.
    const modelCloneNodeValue = modelClone.node( n.path, n.ind ).getVal();

    if ( modelCloneNodeValue.toString() === '' ) {
        return;
    }

    if ( typeof n.constraint !== 'undefined' && n.constraint !== null && n.constraint.length > 0 && !modelClone.evaluate( n.constraint, 'boolean', n.path, n.ind ) ) {
        const question = input.closest( '.question' );
        const msg = question.querySelector( '.or-constraint-msg.active' ).innerHTML;
        gui.alertStrictError( msg );
        // Cancel propagation input
        evt.stopImmediatePropagation();
        const currentModelValue = that.model.node( n.path, n.ind ).getVal();
        that.input.setVal( input, currentModelValue );
        // When changing this make sure that the radio picker's change
        // listener picks this event up.
        // https://github.com/OpenClinica/enketo-express-oc/issues/168
        input.dispatchEvent( events.InputUpdate() );
        question.scrollIntoView();
    }
};


// customized to also work on groups
Form.prototype.setValid = function( node, type ) {
    const classes = ( type ) ? [ `invalid-${type}` ] : [ 'invalid-constraint', 'invalid-required', 'invalid-relevant' ];
    node.closest( '.question, .calculation, .or-group, .or-group-data' ).classList.remove( ...classes );
};

// customized to also work on groups
Form.prototype.setInvalid = function( node, type ) {
    type = type || 'constraint';

    if ( config.validatePage === false && this.isValid( node ) ) {
        this.blockPageNavigation();
    }

    node.closest( '.question, .calculation, .or-group, .or-group-data' ).classList.add( `invalid-${type}` );
};

Form.prototype.isValid = function( node ) {
    if ( node ) {
        const questionOrGroup = node.closest( '.question, .calculation, .or-group, .or-group-data' );
        const cls = questionOrGroup.classList;

        return !cls.contains( 'invalid-required' ) && !cls.contains( 'invalid-constraint' && !cls.contains( 'invalid-relevant' ) );
    }

    return this.view.html.querySelector( '.invalid-required, .invalid-constraint, .invalid-relevant' ) === null;
};

export { Form };
