import downloadUtils from 'enketo-core/src/js/download-utils';

const originalUpdateDownloadLink = downloadUtils.updateDownloadLink;

downloadUtils.updateDownloadLink = function( anchor ){
    originalUpdateDownloadLink.apply( null, arguments );
    anchor.setAttribute( 'title', 'Right click and select "Save link as..." to download' );
};
