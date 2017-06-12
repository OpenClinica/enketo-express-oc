'use strict';

var $ = require( 'jquery' );

$(document).keydown(function(e) {
    if (e.key === 'Tab') {
        var currentFocus = $(':focus');
        if (currentFocus.is('input[type=radio]')) {
            var name = currentFocus.attr('name');
            var allRadiosSameName = $('input[type=radio][name="' + name +  '"]');
            var currentRadio = allRadiosSameName.index(currentFocus);
            var nextRadio;
            if (!e.shiftKey) {
                nextRadio = allRadiosSameName[currentRadio + 1];
            } else {
                nextRadio = allRadiosSameName[currentRadio - 1];
            }
            if (nextRadio) {
                nextRadio.focus();
                e.preventDefault();
            }
        }
    }
});