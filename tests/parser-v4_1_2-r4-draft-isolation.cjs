const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const V=require('../modules/productivity-accuracy-v703316.js');

const memory={v:{},setItem(k,v){this.v[k]=v},getItem(k){return this.v[k]||null},removeItem(k){delete this.v[k]}};
const base='user-1|Concept.pdf|12345|999';
const r3='v703316-v412-item-block-evidence-r3';
const r4='v703316-v412-item-block-evidence-r4';

const staleRows=[
 {sku:'1604DSP',item_name:'Digital Power Amplifier with DSP'},
 {sku:'ZX11-90',item_name:'Digital Mixer'},
 {sku:'',item_name:'Outdoor Dual Microphone Wall Receptacle'},
 {sku:'',item_name:'Digital Mixer'},
 {sku:'',item_name:'Single Channel Digital Wireless Handheld Microphone System'},
 {sku:'MS101-4',item_name:'Single Channel Digital Wireless Handheld Microphone System'},
 {sku:'XDP-3002',item_name:'Dual CD/MP3 Player'}
];

const staleKey=V.revisionScopedDraftIdentity(base,r3);
const liveKey=V.revisionScopedDraftIdentity(base,r4);
V.saveDraft(staleKey,{parserRevision:r3,doc:{supplier_name:'Concept'},items:staleRows},memory);

assert.equal(V.loadDraft(liveKey,memory),null,'R4 must not find an R3 draft under the same PDF/user identity');
assert.equal(V.draftCompatible(V.loadDraft(staleKey,memory),r4),false,'R3 draft must be incompatible with R4');
assert.equal(V.draftCompatible(V.loadDraft(staleKey,memory),r3),true,'same-revision draft should remain compatible');

V.saveDraft(base,{doc:{supplier_name:'Concept'},items:staleRows},memory);
assert.equal(V.loadDraft(liveKey,memory),null,'legacy unversioned draft must not alias the R4 key');

const goodRows=[
 {sku:'1604DSP',item_name:'Digital Power Amplifier with DSP'},
 {sku:'ZX1I-90',item_name:'Passive Loudspeaker'},
 {sku:'CQ12T',item_name:'Digital Mixer'},
 {sku:'SLXD24/SM58',item_name:'Single Channel Digital Wireless Handheld Microphone System'},
 {sku:'MS101-4',item_name:'Monitor Speaker'},
 {sku:'XDP-3002',item_name:'Dual CD/MP3 Player'}
];
V.saveDraft(liveKey,{parserRevision:r4,doc:{supplier_name:'Concept'},items:goodRows},memory);
const same=V.loadDraft(liveKey,memory);
assert.ok(V.draftCompatible(same,r4),'same R4 draft should be compatible');
assert.deepEqual(same.payload.items,goodRows,'same-revision user draft should remain restorable');

const runtime=fs.readFileSync(path.join(__dirname,'..','runtime-v7.03.3.16.js'),'utf8');
assert.ok(runtime.includes('revisionScopedDraftIdentity(v703316DraftBaseIdentity(file),v703316ParserRevision())'),'runtime must scope draft keys to parser revision');
assert.ok(runtime.includes('draftCompatible(draft,v703316ParserRevision())'),'runtime must reject incompatible draft payloads');
assert.ok(runtime.includes("state.importDraftRestoredAt=''"),'new imports must clear stale restored-draft UI state');
assert.ok(runtime.includes('parserRevision:v703316ParserRevision()'),'saved drafts must record parser revision');

console.log('V4.1.2 R4 STALE DRAFT ISOLATION: PASS');
