/**
 * Deals with the main high level survey controls for the special online-only auto-fieldsubmission view.
 *
 * Field values are automatically submitted upon change to a special OpenClinica Field Submission API.
 */

import gui from './gui';

import settings from './settings';
import { Form } from './form'; // modified for OC
import { FormModel } from './form-model'; // modified for OC
import fileManager from './file-manager';
import events from './event';
import { t } from './translator';
import $ from 'jquery';
import FieldSubmissionQueue from './field-submission-queue';
let fieldSubmissionQueue;
import rc from './controller-webform';
import reasons from './reasons';
const DEFAULT_THANKS_URL = '/thanks';
let form;
let formprogress;
let ignoreBeforeUnload = false;

const formOptions = {
    printRelevantOnly: settings.printRelevantOnly
};
const inputUpdateEventBuffer = [];

function init( formEl, data, loadWarnings = [] ) {
    let loadErrors = [];

    formprogress = document.querySelector( '.form-progress' );

    return new Promise( resolve => {
        let staticDefaultNodes = [];
        let m;
        const goToErrorLink = settings.goToErrorUrl ? `<a href="${settings.goToErrorUrl}">${settings.goToErrorUrl}</a>` : '';

        fieldSubmissionQueue = new FieldSubmissionQueue();

        if ( data.instanceAttachments ) {
            fileManager.setInstanceAttachments( data.instanceAttachments );
        }

        // Create separate model just to identify static default values.
        // We do this before the inputupdate listener to avoid triggering a fieldsubmission for instanceID
        // in duplicate/triplicate.
        if ( !data.instanceStr ){
            m = new FormModel( { modelStr: data.modelStr } );
            m.init();
            staticDefaultNodes = [ ...m.node( null, null, { noEmpty: true } ).getElements() ]
                .filter( node => node !== m.getMetaNode( 'instanceID' ).getElement() );
        }
        form = new Form( formEl, data, formOptions );

        fieldSubmissionQueue = new FieldSubmissionQueue();

        // Buffer inputupdate events (DURING LOAD ONLY), in order to eventually log these
        // changes in the DN widget after it has been initalized
        form.view.html.addEventListener( events.InputUpdate().type, _addToInputUpdateEventBuffer );

        // For Participant emtpy-form view in order to show Close button on all pages
        if ( settings.strictViolationSelector && settings.type !== 'edit' ) {
            form.view.html.classList.add( 'empty-untouched' );
        }
        // For all Participant views, use a hacky solution to change the default relevant message
        if ( settings.strictViolationSelector ) {
            const list = form.view.html.querySelectorAll( '[data-i18n="constraint.relevant"]' );
            for ( let i = 0; i < list.length; i++ ) {
                const relevantErrorMsg = t( 'constraint.relevant' );
                list[ i ].textContent = relevantErrorMsg;
            }
        }

        // set form eventhandlers before initializing form
        _setFormEventHandlers();

        const handleGoToIrrelevant = e => {
            let err;
            // In OC hidden go_to fields should show loadError
            // regular questions:
            if ( !e.target.classList.contains( 'or-appearance-dn' ) ) {
                err = t( 'alert.goto.irrelevant' );
            }
            // Discrepancy notes
            else {
                err = `${t( 'alert.goto.irrelevant' )} `;
                const goToErrorLink = settings.goToErrorUrl ? `<a href="${settings.goToErrorUrl}">${settings.goToErrorUrl}</a>` : '';
                if ( settings.interface === 'queries' ) {
                    err += goToErrorLink ? t( 'alert.goto.msg2', {
                        miniform: goToErrorLink,
                        // switch off escaping
                        interpolation: {
                            escapeValue: false
                        }
                    } ) : t( 'alert.goto.msg1' );
                }
            }
            // For goto targets that are discrepancy notes and are relevant but their linked question is not,
            // the goto-irrelevant event will be fired twice. We can safely remove the eventlistener after the first
            // event is caught (for all cases).
            form.view.html.removeEventListener( events.GoToIrrelevant().type, handleGoToIrrelevant );
            loadWarnings.push( err );
        };

        const handleGoToInvisible = () => {
            form.view.html.removeEventListener( events.GoToInvisible().type, handleGoToInvisible );
            if ( settings.interface === 'sdv' ) {
                loadWarnings.push( `${t( 'alert.goto.invisible' )} ` );
            }
        };

        // listen for "goto-irrelevant" event and add error
        form.view.html.addEventListener( events.GoToIrrelevant().type, handleGoToIrrelevant );
        form.view.html.addEventListener( events.GoToInvisible().type, handleGoToInvisible );

        loadErrors = loadErrors.concat( form.init() );

        // Create fieldsubmissions for static default values
        staticDefaultNodes.forEach( node => {
            const props = m.getUpdateEventData( node );
            fieldSubmissionQueue.addFieldSubmission( props.fullPath, props.xmlFragment, form.instanceID );
        } );

        // Make sure audits are logged in DN widget for calculated values during form initialization
        // before the DN widget was initialized.
        form.view.html.removeEventListener( events.InputUpdate().type, _addToInputUpdateEventBuffer );
        inputUpdateEventBuffer.forEach( el => el.dispatchEvent( events.FakeInputUpdate() ) );

        // Check if record is marked complete, before setting button event handlers.
        if ( data.instanceStr ) {
            const regCloseButton = document.querySelector( 'button#close-form-regular' );
            if ( form.model.isMarkedComplete() ) {
                const finishButton = document.querySelector( 'button#finish-form' );
                if ( finishButton ) {
                    finishButton.remove();
                }
                if ( regCloseButton ) {
                    regCloseButton.id = 'close-form-complete';
                }
            } else if ( settings.reasonForChange ) {
                loadErrors.push( 'This record is not complete and cannot be used here.' );
                if ( regCloseButton ) {
                    regCloseButton.remove();
                }
            }
            if ( !settings.headless ) {
                form.specialOcLoadValidate( form.model.isMarkedComplete() );
            }
        }

        _setButtonEventHandlers();

        // Remove loader. This will make the form visible.
        // In order to aggregate regular loadErrors and GoTo loaderrors,
        // this is placed in between form.init() and form.goTo().
        $( '.main-loader' ).remove();
        if ( settings.goTo && location.hash ) {
            // form.goTo returns an array of 1 error if it has error. We're using our special
            // knowledge of Enketo Core to replace this error
            let goToErrors = form.goTo( decodeURIComponent( location.hash.substring( 1 ) ).split( '#' )[ 0 ] );
            const replacementError = `${t( 'alert.goto.notfound' )} `;
            if ( goToErrors.length ) {
                if ( settings.interface === 'queries' ) {
                    goToErrors = goToErrorLink ? [ replacementError + t( 'alert.goto.msg2', {
                        miniform: goToErrorLink,
                        // switch off escaping
                        interpolation: {
                            escapeValue: false
                        }
                    } ) ] : [ replacementError + t( 'alert.goto.msg1' ) ];
                } else {
                    goToErrors = [ replacementError ];
                }
            }
            loadWarnings = loadWarnings.concat( goToErrors );
        }

        if ( form.encryptionKey ) {
            loadErrors.unshift( `<strong>${t( 'error.encryptionnotsupported' )}</strong>` );
        }

        rc.setLogoutLinkVisibility();

        if ( loadErrors.length > 0 ) {
            document.querySelectorAll( '.form-footer__content__main-controls button' )
                .forEach( button => button.remove() );
        } else if ( settings.type !== 'view' ) {
            // Current queue can be submitted, and so can future fieldsubmissions.
            fieldSubmissionQueue.enable();
            fieldSubmissionQueue.submitAll();
        }

        const loadIssues = loadWarnings.concat( loadErrors );

        if ( loadIssues.length ) {
            throw loadIssues;
        }

        resolve( form );
    } )
        .catch( error => {
            if ( Array.isArray( error ) ) {
                loadErrors = error;
            } else {
                loadErrors.unshift( error.message || t( 'error.unknown' ) );
            }

            const advice = ( data.instanceStr ) ? t( 'alert.loaderror.editadvice' ) : t( 'alert.loaderror.entryadvice' );
            gui.alertLoadErrors( loadErrors, advice );
        } )
        .then( () => {
            if ( settings.headless ) {
                let action;
                console.log( 'doing headless things' );
                gui.prompt = () => Promise.resolve( true );
                const resultFragment = document.createRange().createContextualFragment(
                    `<div
                        id="headless-result"
                        style="position: fixed; width: 100%; background: pink; top: 0; left: 0; border: 5px solid black; padding: 10px 20px; text-align:center;"
                        ></div>`
                ).querySelector( '#headless-result' );

                if ( loadErrors.length ) {
                    action = Promise.reject( new Error( loadErrors[ 0 ] ) );
                } else {
                    if ( settings.reasonForChange ) {
                        if ( !form.model.isMarkedComplete() ) {
                            action = Promise.reject( new Error( 'Attempt to load RFC view for non-completed record.' ) );
                        } else {
                            action = _closeCompletedRecord( true );
                        }
                    } else {
                        action = _closeRegular( true );
                    }
                }

                return action
                    .catch( error => {
                        resultFragment.append( document.createRange().createContextualFragment( `<div id="error">${error.message}</div>` ) );
                    } )
                    .finally( () => {
                        const fieldsubmissions = fieldSubmissionQueue.submittedCounter;
                        resultFragment.append( document.createRange().createContextualFragment(
                            `<div
                                id="fieldsubmissions"
                                style="border: 5px dotted black; display: inline-block; padding: 10px 20px;"
                            >${fieldsubmissions}</div>` ) );
                        document.querySelector( 'body' ).append( resultFragment );
                    } );
            }
        } )
        // OC will return even if there were errors
        .then( () => form );
}

function _addToInputUpdateEventBuffer( event ) {
    inputUpdateEventBuffer.push( event.target );
}

/**
 * Closes the form after checking that the queue is empty.
 *
 * @param offerAutoqueries
 * @return {Promise} [description]
 */
function _closeRegular( offerAutoqueries = true ) {
    return form.validate()
        .then( () => {
            let msg = '';
            const tAlertCloseMsg = t( 'fieldsubmission.alert.close.msg1' );
            const tAlertCloseHeading = t( 'fieldsubmission.alert.close.heading1' );
            const authLink = `<a href="/login" target="_blank">${t( 'here' )}</a>`;

            if ( offerAutoqueries ) {
                const violated = [ ...form.view.html.querySelectorAll( '.invalid-constraint, .invalid-relevant' ) ]
                    .filter( question => !question.querySelector( '.btn-comment.new, .btn-comment.updated' ) || question.matches( '.or-group.invalid-relevant, .or-group-data.invalid-relevant' ) );

                // First check if any constraints have been violated and prompt option to generate automatic queries
                if ( violated.length ) {
                    return gui.confirm( {
                        heading: t( 'alert.default.heading' ),
                        errorMsg: t( 'fieldsubmission.confirm.autoquery.msg1' ),
                        msg: t( 'fieldsubmission.confirm.autoquery.msg2' )
                    }, {
                        posButton: t( 'fieldsubmission.confirm.autoquery.automatic' ),
                        negButton: t( 'fieldsubmission.confirm.autoquery.manual' ),
                    } )
                        .then( confirmed => {
                            if ( !confirmed ) {
                                return false;
                            }
                            _autoAddQueries( violated );

                            return _closeRegular( false );
                        } );
                }
            }

            // Start with actually closing, but only proceed once the queue is emptied.
            gui.alert( `${tAlertCloseMsg}<br/><div class="loader-animation-small" style="margin: 40px auto 0 auto;"/>`, tAlertCloseHeading, 'bare' );

            return fieldSubmissionQueue.submitAll()
                .then( () => {
                    if ( fieldSubmissionQueue.enabled && Object.keys( fieldSubmissionQueue.get() ).length > 0 ) {
                        throw new Error( t( 'fieldsubmission.alert.close.msg2' ) );
                    } else {
                        // this event is used in communicating back to iframe parent window
                        document.dispatchEvent( events.Close() );

                        msg += t( 'alert.submissionsuccess.redirectmsg' );
                        gui.alert( msg, t( 'alert.submissionsuccess.heading' ), 'success' );
                        _redirect();
                    }
                } )
                .catch( error => {
                    let errorMsg;
                    error = error || {};

                    console.error( 'close error', error );
                    if ( error.status === 401 ) {
                        errorMsg = t( 'alert.submissionerror.authrequiredmsg', {
                            here: authLink
                        } );
                        gui.alert( errorMsg, t( 'alert.submissionerror.heading' ) );
                    } else {
                        errorMsg = error.message || gui.getErrorResponseMsg( error.status );
                        gui.confirm( {
                            heading: t( 'alert.default.heading' ),
                            errorMsg,
                            msg: t( 'fieldsubmission.confirm.leaveanyway.msg' )
                        }, {
                            posButton: t( 'confirm.default.negButton' ),
                            negButton: t( 'fieldsubmission.confirm.leaveanyway.button' )
                        } )
                            .then( confirmed => {
                                if ( !confirmed ) {
                                    document.dispatchEvent( events.Close() );
                                    _redirect( 100 );
                                }
                            } );
                    }
                    if ( settings.headless ) {
                        throw new Error( errorMsg );
                    }

                } );
        } );


}

function _closeSimple() {

    return form.validate()
        .then( () => {
            let msg = '';
            const tAlertCloseMsg = t( 'fieldsubmission.alert.close.msg1' );
            const tAlertCloseHeading = t( 'fieldsubmission.alert.close.heading1' );
            const authLink = `<a href="/login" target="_blank">${t( 'here' )}</a>`;

            // Start with actually closing, but only proceed once the queue is emptied.
            gui.alert( `${tAlertCloseMsg}<br/><div class="loader-animation-small" style="margin: 40px auto 0 auto;"/>`, tAlertCloseHeading, 'bare' );

            return fieldSubmissionQueue.submitAll()
                .then( () => {
                    if ( fieldSubmissionQueue.enabled && Object.keys( fieldSubmissionQueue.get() ).length > 0 ) {
                        throw new Error( t( 'fieldsubmission.alert.close.msg2' ) );
                    } else {
                        // this event is used in communicating back to iframe parent window
                        document.dispatchEvent( events.Close() );

                        msg += t( 'alert.submissionsuccess.redirectmsg' );
                        gui.alert( msg, t( 'alert.submissionsuccess.heading' ), 'success' );
                        _redirect();
                    }
                } )
                .catch( error => {
                    let errorMsg;
                    error = error || {};

                    if ( error.status === 401 ) {
                        errorMsg = t( 'alert.submissionerror.authrequiredmsg', {
                            here: authLink
                        } );
                        gui.alert( errorMsg, t( 'alert.submissionerror.heading' ) );
                    } else {
                        errorMsg = error.message || gui.getErrorResponseMsg( error.status );
                        gui.confirm( {
                            heading: t( 'alert.default.heading' ),
                            errorMsg,
                            msg: t( 'fieldsubmission.confirm.leaveanyway.msg' )
                        }, {
                            posButton: t( 'confirm.default.negButton' ),
                            negButton: t( 'fieldsubmission.confirm.leaveanyway.button' )
                        } )
                            .then( confirmed => {
                                if ( !confirmed ) {
                                    document.dispatchEvent( events.Close() );
                                    _redirect( 100 );
                                }
                            } );
                    }
                } );
        } );

}

// This is conceptually a Complete function that has some pre-processing.
function _closeCompletedRecord( offerAutoqueries = true ) {

    if ( !reasons.validate() ) {
        const firstInvalidInput = reasons.getFirstInvalidField();
        const msg = t( 'fieldsubmission.alert.reasonforchangevalidationerror.msg' );
        gui.alert( msg );
        firstInvalidInput.scrollIntoView();
        firstInvalidInput.focus();

        return Promise.reject( new Error( msg ) );
    } else {
        reasons.clearAll();
    }

    return form.validate()
        .then( valid => {
            if ( !valid && offerAutoqueries ) {
                const violations = [ ...form.view.html.querySelectorAll( '.invalid-constraint, .invalid-required, .invalid-relevant' ) ]
                    .filter( question => !question.querySelector( '.btn-comment.new, .btn-comment.updated' ) || question.matches( '.or-group.invalid-relevant, .or-group-data.invalid-relevant' ) );

                // Note that unlike _close this also looks at .invalid-required.
                if ( violations.length ) {
                    return gui.confirm( {
                        heading: t( 'alert.default.heading' ),
                        errorMsg: t( 'fieldsubmission.confirm.autoquery.msg1' ),
                        msg: t( 'fieldsubmission.confirm.autoquery.msg2' )
                    }, {
                        posButton: t( 'fieldsubmission.confirm.autoquery.automatic' ),
                        negButton: t( 'fieldsubmission.confirm.autoquery.manual' )
                    } )
                        .then( confirmed => {
                            if ( !confirmed ) {
                                return false;
                            }
                            _autoAddQueries( violations );

                            return _closeCompletedRecord( false );
                        } );
                } else {
                    return _complete( true, true );
                }
            } else {
                return _complete( true, true );
            }
        } );
}

function _closeParticipant() {

    // If the form is untouched, and has not loaded a record, allow closing it without any checks.
    // TODO: can we ignore calculations?
    if ( settings.type !== 'edit' &&  ( Object.keys( fieldSubmissionQueue.get() ).length === 0 || !fieldSubmissionQueue.enabled ) && fieldSubmissionQueue.submittedCounter === 0 ) {
        return Promise.resolve()
            .then( () => {
                gui.alert( t( 'alert.submissionsuccess.redirectmsg' ), null, 'success' );
                // this event is used in communicating back to iframe parent window
                document.dispatchEvent( events.Close() );
                _redirect( 600 );
            } );
    }

    return form.validate()
        .then( valid => {
            if ( !valid ) {
                const strictViolations = form.view.html
                    .querySelector( settings.strictViolationSelector );

                valid = !strictViolations;
            }
            if ( valid ) {
                return _closeSimple();
            }
            gui.alertStrictBlock();
        } );
}

function _redirect( msec ) {
    if ( settings.headless ) {
        return true;
    }
    ignoreBeforeUnload = true;
    setTimeout( () => {
        location.href = decodeURIComponent( settings.returnUrl || DEFAULT_THANKS_URL );
    }, msec || 1200 );
}

/**
 * Finishes a submission
 *
 * @param bypassConfirmation
 * @param bypassChecks
 */
function _complete( bypassConfirmation = false, bypassChecks = false ) {

    if ( !bypassConfirmation ) {
        return gui.confirm( {
            heading: t( 'fieldsubmission.confirm.complete.heading' ),
            msg: t( 'fieldsubmission.confirm.complete.msg' )
        } );
    }

    // form.validate() will trigger fieldsubmissions for timeEnd before it resolves
    return form.validate()
        .then( valid => {
            if ( !valid && !bypassChecks ) {
                const strictViolations = form.view.html
                    .querySelector( settings.strictViolationSelector );
                if ( strictViolations ) {
                    gui.alertStrictBlock();
                    throw new Error( t( 'fieldsubmission.alert.participanterror.msg' ) );
                } else if ( form.view.html.querySelector( '.invalid-relevant' ) ) {
                    const msg = t( 'fieldsubmission.alert.relevantvalidationerror.msg' );
                    gui.alert( msg );
                    throw new Error( msg );
                } else {
                    const msg = t( 'fieldsubmission.alert.validationerror.msg' );
                    gui.alert( msg );
                    throw new Error( msg );
                }
            } else {
                let beforeMsg;
                let authLink;
                let instanceId;
                let deprecatedId;
                let msg = '';

                form.view.html.dispatchEvent( events.BeforeSave() );

                beforeMsg = t( 'alert.submission.redirectmsg' );
                authLink = `<a href="/login" target="_blank">${t( 'here' )}</a>`;

                gui.alert( `${beforeMsg}<div class="loader-animation-small" style="margin: 40px auto 0 auto;"/>`, t( 'alert.submission.msg' ), 'bare' );

                return fieldSubmissionQueue.submitAll()
                    .then( () => {
                        if ( Object.keys( fieldSubmissionQueue.get() ).length === 0 ) {
                            instanceId = form.instanceID;
                            deprecatedId = form.deprecatedID;
                            if ( form.model.isMarkedComplete() ) {
                                return;
                            } else {
                                return fieldSubmissionQueue.complete( instanceId, deprecatedId );
                            }
                        } else {
                            throw new Error( t( 'fieldsubmission.alert.complete.msg' ) );
                        }
                    } )
                    .then( () => {
                        // this event is used in communicating back to iframe parent window
                        document.dispatchEvent( events.SubmissionSuccess() );

                        msg += t( 'alert.submissionsuccess.redirectmsg' );
                        gui.alert( msg, t( 'alert.submissionsuccess.heading' ), 'success' );
                        _redirect();
                    } )
                    .catch( result => {
                        result = result || {};

                        if ( result.status === 401 ) {
                            msg = t( 'alert.submissionerror.authrequiredmsg', {
                                here: authLink
                            } );
                        } else {
                            msg = result.message || gui.getErrorResponseMsg( result.status );
                        }
                        gui.alert( msg, t( 'alert.submissionerror.heading' ) );
                        // meant to be used in headless mode to output in API response
                        throw new Error( msg );
                    } );
            }
        } );
}

/**
 * Triggers autoqueries.
 *
 * @param {*} $questions
 * @param questions
 */
function _autoAddQueries( questions ) {
    questions.forEach( q => {
        if ( q.matches( '.question' ) ) {
            q.dispatchEvent( events.AddQuery() );
        } else if ( q.matches( '.or-group.invalid-relevant, .or-group-data.invalid-relevant' ) ) {
            q.querySelectorAll( '.question:not(.or-appearance-dn)' ).forEach( el => el.dispatchEvent( events.AddQuery() ) );
        }
    } );
}

function _autoAddReasonQueries( $rfcInputs ) {
    $rfcInputs.val( t( 'widget.dn.autonoreason' ) ).trigger( 'change' );
}

function _doNotSubmit( fullPath ) {
    // no need to check on cloned radiobuttons, selects or textareas
    const pathWithoutPositions = fullPath.replace( /\[[0-9]+\]/g, '' );

    return !!form.view.$.get( 0 ).querySelector( `input[data-oc-external="clinicaldata"][name="${pathWithoutPositions}"]` );
}

function _setFormEventHandlers() {

    form.view.html.addEventListener( events.ProgressUpdate().type, event => {
        if ( event.target.classList.contains( 'or' ) && formprogress && event.detail ) {
            formprogress.style.width = `${event.detail}%`;
        }
    } );

    // After repeat removal from view (before removal from model)
    form.view.html.addEventListener( events.Removed().type, event => {
        const updated = event.detail || {};
        const instanceId = form.instanceID;
        if ( !updated.xmlFragment ) {
            console.error( 'Could not submit repeat removal fieldsubmission. XML fragment missing.' );

            return;
        }
        if ( !instanceId ) {
            console.error( 'Could not submit repeat removal fieldsubmission. InstanceID missing' );
        }

        postHeartbeat();
        fieldSubmissionQueue.addRepeatRemoval( updated.xmlFragment, instanceId, form.deprecatedID );
        fieldSubmissionQueue.submitAll();
    } );
    // Field is changed
    form.view.html.addEventListener( events.DataUpdate().type, event => {
        const updated = event.detail || {};
        const instanceId = form.instanceID;
        let filePromise;

        if ( updated.cloned ) {
            // This event is fired when a repeat is cloned. It does not trigger
            // a fieldsubmission.
            return;
        }

        // This is a bit of a hacky test for /meta/instanceID and /meta/deprecatedID. Both meta and instanceID nodes could theoretically have any namespace prefix.
        // and if the namespace is not in the default or the "http://openrosa.org/xforms" namespace it should actually be submitted.
        if ( /meta\/(.*:)?instanceID$/.test( updated.fullPath ) || /meta\/(.*:)?deprecatedID$/.test( updated.fullPath ) ){
            return;
        }

        if ( !updated.xmlFragment ) {
            console.error( 'Could not submit field. XML fragment missing. (If repeat was deleted, this is okay.)' );

            return;
        }
        if ( !instanceId ) {
            console.error( 'Could not submit field. InstanceID missing' );

            return;
        }
        if ( !updated.fullPath ) {
            console.error( 'Could not submit field. Path missing.' );
        }
        if ( _doNotSubmit( updated.fullPath ) ) {
            return;
        }
        if ( updated.file ) {
            filePromise = fileManager.getCurrentFile( updated.file );
        } else {
            filePromise = Promise.resolve();
        }

        // remove the Participate class that shows a Close button on every page
        form.view.html.classList.remove( 'empty-untouched' );

        // Only now will we check for the deprecatedID value, which at this point should be (?)
        // populated at the time the instanceID dataupdate event is processed and added to the fieldSubmission queue.
        postHeartbeat();
        filePromise
            .then( file => {
                fieldSubmissionQueue.addFieldSubmission( updated.fullPath, updated.xmlFragment, instanceId, form.deprecatedID, file );
                fieldSubmissionQueue.submitAll();
            } );
    } );

    // Before repeat removal from view and model
    if ( settings.reasonForChange ) {

        $( '.form-footer' ).find( '.next-page, .last-page, .previous-page, .first-page' ).on( 'click', evt => {
            const valid = reasons.validate();
            if ( !valid ) {
                evt.stopImmediatePropagation();

                return false;
            }
            reasons.clearAll();

            return true;
        } );
    }
}

function _setButtonEventHandlers() {
    $( 'button#finish-form' ).click( function() {
        const $button = $( this ).btnBusyState( true );

        _complete()
            .then( again => {
                if ( again ) {
                    return _complete( again );
                }
            } )
            .catch( e => {
                gui.alert( e.message );
            } )
            .then( () => {
                $button.btnBusyState( false );
            } );

        return false;
    } );

    $( 'button#close-form-regular' ).click( function() {
        const $button = $( this ).btnBusyState( true );

        _closeRegular()
            .then( again => {
                if ( again ) {
                    return _closeRegular( true );
                }
            } )
            .catch( e => {
                console.error( e );
            } )
            .then( () => {
                $button.btnBusyState( false );
            } );

        return false;
    } );

    // This is for closing a record that was marked as final. It's quite different
    // from Complete or the regular Close.
    $( 'button#close-form-complete' ).click( function() {
        const $button = $( this ).btnBusyState( true );

        // form.validate() will trigger fieldsubmissions for timeEnd before it resolves
        _closeCompletedRecord()
            .catch( e => {
                gui.alert( e.message );
            } )
            .then( () => {
                $button.btnBusyState( false );
            } );

        return false;
    } );

    // This is for closing a record in a readonly or note-only view.
    $( 'button#close-form-read' ).click( function() {
        const $button = $( this ).btnBusyState( true );

        _closeSimple()
            .catch( e => {
                gui.alert( e.message );
            } )
            .then( () => {
                $button.btnBusyState( false );
            } );

        return false;
    } );

    // This is for closing a participant view.
    $( 'button#close-form-participant' ).click( function() {
        const $button = $( this ).btnBusyState( true );

        _closeParticipant()
            .catch( e => {
                gui.alert( e.message );
            } )
            .then( () => {
                $button.btnBusyState( false );
            } );

        return false;
    } );

    if ( rc.inIframe() && settings.parentWindowOrigin ) {
        document.addEventListener( events.SubmissionSuccess().type, rc.postEventAsMessageToParentWindow );
        document.addEventListener( events.Edited().type, rc.postEventAsMessageToParentWindow );
        document.addEventListener( events.Close().type, rc.postEventAsMessageToParentWindow );

        form.view.html.addEventListener( events.PageFlip().type, postHeartbeat );
        form.view.html.addEventListener( events.AddRepeat().type, postHeartbeat );
        form.view.html.addEventListener( events.Heartbeat().type, postHeartbeat );
    }

    if ( settings.type !== 'view' ) {
        window.onbeforeunload = () => {
            if ( !ignoreBeforeUnload ) {
                // Do not add autoqueries for note-only views
                if ( !( /\/fs\/dn\//.test( window.location.pathname ) ) ) {
                    _autoAddQueries( form.view.html.querySelectorAll( '.invalid-constraint' ) );
                    _autoAddReasonQueries( reasons.getInvalidFields() );
                }
                if ( fieldSubmissionQueue.enabled && Object.keys( fieldSubmissionQueue.get() ).length > 0 ) {
                    return 'Any unsaved data will be lost';
                }
            }
        };
    }

}

function postHeartbeat() {
    if ( rc.inIframe() && settings.parentWindowOrigin ) {
        rc.postEventAsMessageToParentWindow( events.Heartbeat() );
    }
}

export default {
    init
};
