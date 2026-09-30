(function(root){
  'use strict';
  const release=Object.freeze({
    appVersion:'7.03.3.16',
    parserVersion:'V4.1.2',
    runtimeFile:'runtime-v7.03.3.16.js',
    assetRevision:'v703316-v412-item-block-evidence-r2',
    currentNotes:[
      'Parser V4.1.2 preserves valid source-supported identities, promotes stronger same-item labelled models, and quarantines only unresolved identities.',
      'Evidence Ledger records positive source support for parsed header and line-item fields.',
      'Dual extraction consensus compares independent native-PDF and OCR evidence when both are available.',
      'Name-only Master Item matching can no longer auto-merge records without stable SKU/model identity.',
      'Import Review now includes a verification summary and autosaves unfinished corrections.',
      'Parser diagnostics remain hidden from normal users while Admin diagnostics stay available internally.',
      'Release identity, parser identity and runtime naming are synchronized for v7.03.3.16.'
    ],
    upcomingVersion:'7.03.3.17',
    upcomingNotes:[
      'Exception-only review workflow with field-level user-facing confidence states.',
      'Expanded raw-PDF production-path regression corpus and unseen-supplier release gate.',
      'Mandatory invoice-level mathematical reconciliation and stronger serial cardinality checks.',
      'Universal Needs Attention work queue and exception-first dashboard.',
      'Show intentionally excluded invoice rows in a collapsed review section.',
      'Continue runtime and CSS component modularisation.',
      'Keyboard-first review workflow and parser correction analytics.',
      'Supplier layout fingerprints and expanded pre-save data-integrity invariants.'
    ]
  });
  root.INVENTORY_RELEASE=release;
})(typeof globalThis!=='undefined'?globalThis:this);
