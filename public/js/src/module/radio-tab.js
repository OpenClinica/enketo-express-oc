'use strict';

var $ = require( 'jquery' );
require( './jquery-ui' );

$(document).keydown(function(e) {
    if (e.key === 'Tab') {
        var currentFocus = $(':focus');
        if (currentFocus) {
            var focusables = $(':focusable');
            var current = focusables.index(currentFocus);
            var next = focusables[current + 1];
            if (e.shiftKey) {
                next = focusables[current - 1];
            }
            if (next) {
                next.focus();
                e.preventDefault();
            }
        }
    }
} );
