/**
 * Deals with the main high level survey controls for the special online-only auto-fieldsubmission view.
 *
 * Field values are automatically submitted upon change to a special OpenClinica Field Submission API.
 */

'use strict';

var gui = require( './gui' );
var settings = require( './settings' );
var Form = require( 'enketo-core' );
var fileManager = require( './file-manager' );
var t = require( './translator' ).t;
var $ = require( 'jquery' );
var FieldSubmissionQueue = require( './field-submission-queue' );
var fieldSubmissionQueue = new FieldSubmissionQueue();
var rc = require( './controller-webform' );
var DEFAULT_THANKS_URL = '/thanks';
var ongoingUpdates = [];
var form;
var formSelector;
var formData;
var $formprogress;

function init( selector, data ) {
    var advice;
    var loadErrors = [];

    formSelector = selector;
    formData = data;

    return new Promise( function( resolve, reject ) {
            $formprogress = $( '.form-progress' );
            form = new Form( formSelector, data );

            // set eventhandlers before initializing form
            _setEventHandlers( selector );

            loadErrors = form.init();

            if ( form.getEncryptionKey() ) {
                loadErrors.unshift( '<strong>' + t( 'error.encryptionnotsupported' ) + '</strong>' );
            }

            rc.setLogoutLinkVisibility();

            if ( loadErrors.length > 0 ) {
                throw loadErrors;
            }
            resolve();
        } )
        .catch( function( error ) {
            if ( Array.isArray( error ) ) {
                loadErrors = error;
            } else {
                loadErrors.unshift( error.message || t( 'error.unknown' ) );
            }

            advice = ( data.instanceStr ) ? t( 'alert.loaderror.editadvice' ) : t( 'alert.loaderror.entryadvice' );
            gui.alertLoadErrors( loadErrors, advice );
        } );
}

/**
 * Controller function to reset to a blank form. Checks whether all changes have been saved first
 * @param  {boolean=} confirmed Whether unsaved changes can be discarded and lost forever
 */
function _resetForm( confirmed ) {
    var message;
    var choices;

    if ( !confirmed && form.getEditStatus() ) {
        message = t( 'confirm.save.msg' );
        choices = {
            posAction: function() {
                _resetForm( true );
            }
        };
        gui.confirm( message, choices );
    } else {
        //_setDraftStatus( false );
        form.resetView();
        form = new Form( formSelector, {
            modelStr: formData.modelStr,
            external: formData.external
        } );
        form.init();
        form.getView().$
            .trigger( 'formreset' );
    }
}

function _close() {
    var msg = '';
    var tAlertCloseMsg = t( 'fieldsubmission.alert.close.msg1' );
    var tAlertCloseHeading = t( 'fieldsubmission.alert.close.heading1' );

    gui.alert( tAlertCloseMsg + '<br/>' +
        '<div class="loader-animation-small" style="margin: 40px auto 0 auto;"/>', tAlertCloseHeading, 'bare' );

    return Promise.all( ongoingUpdates )
        .then( function() {
            ongoingUpdates = [];
            return fieldSubmissionQueue.submitAll();
        } )
        .then( function() {
            if ( Object.keys( fieldSubmissionQueue.get() ).length > 0 ) {
                console.log( 'There are unsubmitted items in the queue!' );
                gui.alert( t( 'fieldsubmission.alert.close.msg2' ), t( 'fieldsubmission.alert.close.heading1' ), 'error' );
            } else {
                msg += t( 'alert.submissionsuccess.redirectmsg' );
                gui.alert( msg, t( 'alert.submissionsuccess.heading' ), 'success' );
                setTimeout( function() {
                    location.href = decodeURIComponent( settings.returnUrl || DEFAULT_THANKS_URL );
                }, 1000 );
            }
        } );
}

/**
 * Finishes a submission
 */
function _complete( updated ) {
    var beforeMsg;
    var authLink;
    var instanceId;
    var deprecatedId;
    var msg = '';

    form.getView().$.trigger( 'beforesave' );

    beforeMsg = t( 'alert.submission.redirectmsg' );
    authLink = '<a href="/login" target="_blank">' + t( 'here' ) + '</a>';

    gui.alert( beforeMsg +
        '<div class="loader-animation-small" style="margin: 40px auto 0 auto;"/>', t( 'alert.submission.msg' ), 'bare' );

    return Promise.all( ongoingUpdates )
        .then( function() {
            ongoingUpdates = [];
            return fieldSubmissionQueue.submitAll();
        } )
        .then( function() {
            var queueLength = Object.keys( fieldSubmissionQueue.get() ).length;

            if ( queueLength === 0 ) {
                instanceId = form.getInstanceID();
                deprecatedId = form.getDeprecatedID();
                return fieldSubmissionQueue.complete( instanceId, deprecatedId );
            } else {
                return false;
            }
        } )
        .then( function( result ) {
            if ( result === true ) {
                // this event is used in communicating back to iframe parent window
                $( document ).trigger( 'submissionsuccess' );

                msg += t( 'alert.submissionsuccess.redirectmsg' );
                gui.alert( msg, t( 'alert.submissionsuccess.heading' ), 'success' );
                setTimeout( function() {
                    location.href = decodeURIComponent( settings.returnUrl || DEFAULT_THANKS_URL );
                }, 1500 );
            } else {
                throw new Error( 'Failed to submit.' );
            }
        } )
        .catch( function( result ) {
            result = result || {};
            console.error( 'submission failed', result );
            if ( result.status === 401 ) {
                msg = t( 'alert.submissionerror.authrequiredmsg', {
                    here: authLink
                } );
            } else {
                msg = result.message || gui.getErrorResponseMsg( result.status );
            }
            gui.alert( msg, t( 'alert.submissionerror.heading' ) );
        } );
}

function _setEventHandlers( selector ) {
    var $doc = $( document );
    $doc
        .on( 'progressupdate.enketo', selector, function( event, status ) {
            if ( $formprogress.length > 0 ) {
                $formprogress.css( 'width', status + '%' );
            }
        } );

    $doc.on( 'dataupdate.enketo', selector, function( event, updated ) {
        var instanceId = form.getInstanceID();
        var deprecatedId = form.getDeprecatedID();
        var file;
        var update;

        // console.debug( 'update.enketo', updated );

        if ( updated.cloned ) {
            return;
        }
        if ( !updated.xmlFragment ) {
            console.error( 'Could not submit field. XML fragment missing.' );
            return;
        }
        if ( !instanceId ) {
            console.error( 'Could not submit field. InstanceID missing' );
            return;
        }
        if ( updated.removed ) {
            fieldSubmissionQueue.addRepeatRemoval( updated.xmlFragment, instanceId, deprecatedId );
            fieldSubmissionQueue.submitAll();
        } else if ( updated.fullPath && typeof updated.validCheck !== 'undefined' && updated.requiredCheck !== 'undefined' ) {
            // This is asynchronous! So when complete() triggers a beforesave event, it will check ongoingUpdates first.
            update = updated.requiredCheck
                .then( function( passed ) {
                    if ( passed ) {
                        return updated.validCheck;
                    }
                } )
                .then( function( passed ) {
                    if ( passed ) {
                        if ( updated.file ) {
                            file = fileManager.getCurrentFile( updated.file );
                            console.debug( 'found file', file );
                        }
                        fieldSubmissionQueue.addFieldSubmission( updated.fullPath, updated.xmlFragment, instanceId, deprecatedId, file );
                        return fieldSubmissionQueue.submitAll();
                    } else {
                        console.debug( 'Value fails required and/or validation check. It will not submit' );
                    }
                } );

            ongoingUpdates.push( update );
        } else {
            console.error( 'Could not submit field. Full path or validation checks are missing.' );
        }
    } );

    $( 'button#close-form' ).click( function() {
        var $button = $( this ).btnBusyState( true );
        _close()
            .catch( function( e ) {

            } )
            .then( function() {
                $button.btnBusyState( false );
            } );
        return false;
    } );

    $( 'button#finish-form' ).click( function() {
        var $button = $( this ).btnBusyState( true );

        form.validate()
            .then( function( valid ) {
                if ( valid ) {
                    return _complete();
                } else {
                    gui.alert( t( 'alert.validationerror.msg' ) );
                }
            } )
            .catch( function( e ) {
                gui.alert( e.message );
            } )
            .then( function() {
                $button.btnBusyState( false );
            } );

        return false;
    } );

    if ( rc.inIframe() && settings.parentWindowOrigin ) {
        $doc.on( 'submissionsuccess edited.enketo', rc.postEventAsMessageToParentWindow );
    }

    window.onbeforeunload = function() {
        if ( Object.keys( fieldSubmissionQueue.get() ).length > 0 ) {
            return 'Any unsaved data will be lost';
        }
    };
}

module.exports = {
    init: init
};
