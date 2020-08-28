import './module/radio-tab';
import gui from './module/gui';
import controller from './module/controller-webform-fieldsubmission';
import settings from './module/settings';
import connection from './module/connection';
import { init as initTranslator, t, localize } from './module/translator';
import calculationModule from 'enketo-core/src/js/calculate';
import preloadModule from 'enketo-core/src/js/preload';
import oc from './module/custom';
import events from './module/event';

const loader = document.querySelector( '.main-loader' );
const formheader = document.querySelector( '.main > .paper > .form-header' );
const footer = document.querySelector( '.form-footer' );
const survey = {
    enketoId: settings.enketoId,
    serverUrl: settings.serverUrl,
    xformId: settings.xformId,
    xformUrl: settings.xformUrl,
    instanceId: settings.instanceId
};
const range = document.createRange();
const loadWarnings = [];

initTranslator( survey )
    .then( connection.getFormParts )
    .then( formParts => {
        if ( location.pathname.indexOf( '/edit/' ) > -1 || location.pathname.indexOf( '/view/' ) > -1 ) {
            if ( survey.instanceId ) {
                return connection.getExistingInstance( survey )
                    .then( response => {
                        formParts.instance = response.instance;
                        formParts.instanceAttachments = response.instanceAttachments;

                        // TODO: this will fail massively if instanceID is not populated (will use POST instead of PUT). Maybe do a check?
                        return formParts;
                    } );
            } else if ( location.pathname.indexOf( '/edit/' ) > -1 ) {
                throw new Error( 'This URL is invalid' );
            }
        }

        return formParts;
    } )
    .then( formParts => {
        if ( formParts.form && formParts.model ) {
            return gui.swapTheme( formParts );
        } else {
            throw new Error( t( 'error.unknown' ) );
        }
    } )
    .then( formParts => {
        if ( /\/fs\/dnc?\//.test( window.location.pathname ) ) {
            return _readonlify( formParts, true );
        } else if ( settings.type === 'view' ) {
            return _readonlify( formParts, false );
        }

        return formParts;
    } )
    .then( _init )
    .then( connection.getMaximumSubmissionSize )
    .then( _updateMaxSizeSetting )
    .catch( _showErrorOrAuthenticate );

function _updateMaxSizeSetting( maxSize ) {
    if ( maxSize ) {
        // overwrite default max size
        settings.maxSize = maxSize;
        document.querySelector( 'form.or' ).dispatchEvent( events.UpdateMaxSize() );
    }
}

function _showErrorOrAuthenticate( error ) {
    loader.classList.add( 'fail' );
    if ( error.status === 401 ) {
        window.location.href = `/login?return_url=${encodeURIComponent( window.location.href )}`;
    } else {
        gui.alert( error.message, t( 'alert.loaderror.heading' ) );
    }
}

/**
 * Converts questions to readonly
 * Disables calculations, deprecatedID mechanism and preload items.
 *
 * @param {object} formParts - formParts object
 * @param {boolean} notesEnabled - whether notes are enabled
 * @return {object}          formParts object
 */
function _readonlify( formParts, notesEnabled ) {
    // Styling changes
    document.querySelector( 'body' ).classList.add( 'oc-view' );

    // Partially disable calculations in Enketo Core
    console.info( 'Calculations restricted to clinicaldata only.' );
    calculationModule.originalUpdate = calculationModule.update;
    calculationModule.update = function( updated ) {
        return calculationModule.originalUpdate.call( this, updated, '[data-oc-external="clinicaldata"]' );
    };
    console.info( 'Setvalue disabled.' );
    calculationModule.setvalue = () => {};

    // Completely disable preload items
    console.info( 'Preloaders disabled.' );
    preloadModule.init = () => {};
    // change status message
    const msg = notesEnabled ? t( 'fieldsubmission.noteonly.msg' ) : t( 'fieldsubmission.readonly.msg' );
    formheader.prepend( range.createContextualFragment( `<div class="fieldsubmission-status readonly">${msg}</div>` ) );
    footer.prepend( range.createContextualFragment( `<div class="form-footer__feedback fieldsubmission-status readonly">${msg}</div>` ) );

    formParts.formFragment = range.createContextualFragment( formParts.form );

    // Note: Enketo made a syntax error by adding the readonly attribute on a <select>
    // Hence, we cannot use .prop('readonly', true). We'll continue the syntax error.
    [ ...formParts.formFragment.querySelectorAll( 'input:not([readonly]), textarea:not([readonly]), select:not(#form-languages):not([readonly])' ) ]
        .filter( el =>  notesEnabled ? !el.closest( '.or-appearance-dn' ) : true )
        .forEach( el => {
            el.setAttribute( 'readonly', 'readonly' );
            el.classList.add( 'readonly-forced' );
        } );

    // Properly make native selects readonly (for touchscreens)
    formParts.formFragment.querySelectorAll( 'select:not(#form-languages) option' )
        .forEach( el => el.disabled = true );
    // Prevent adding an Add/Remove UI on repeats
    formParts.formFragment.querySelectorAll( '.or-repeat-info' )
        .forEach( el => el.setAttribute( 'data-repeat-fixed', 'fixed' ) );
    // Record load warning but keep loading
    if ( settings.loadWarning ) {
        loadWarnings.push( settings.loadWarning );
    }

    return formParts;
}

function _init( formParts ) {
    let error;

    return new Promise( ( resolve, reject ) => {
        if ( formParts && formParts.form && formParts.model ) {
            const formFragment = formParts.formFragment || range.createContextualFragment( formParts.form );
            formheader.after( formFragment );
            const formEl = document.querySelector( 'form.or' );

            controller.init( formEl, {
                modelStr: formParts.model,
                instanceStr: formParts.instance,
                external: formParts.externalData,
                instanceAttachments: formParts.instanceAttachments
            }, loadWarnings ).then( form => {
                //formParts.languages = form.languages; // be careful form is undefined if there were load errors
                formParts.htmlView = formEl;
                const titleEl = document.querySelector( '#form-title' );
                const titleText = settings.pid ? `${settings.pid}: ${titleEl.textContent}` : titleEl.textContent;
                document.querySelector( 'head>title' ).textContent = titleText;
                titleEl.textContent = titleText;
                if ( formParts.instance ) {
                    oc.addSignedStatus( form );
                }
                if ( settings.print ) {
                    gui.applyPrintStyle();
                }
                localize( formEl );
                resolve( formParts );
            } );
        } else if ( formParts ) {
            error = new Error( 'Form not complete.' );
            error.status = 400;
            reject( error );
        } else {
            error = new Error( 'Form not found' );
            error.status = 404;
            reject( error );
        }
    } );
}
