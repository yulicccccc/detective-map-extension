// test-adapter.js - Verification test for Detective Map <-> Excalidraw Adapter
import assert from 'assert';
import { initialConcepts, initialEdges } from './src/fixtures/sample-map.js';
import { convertConceptsToExcalidraw, extractConceptPositions, findConceptByElementId } from './src/adapters/conceptAdapter.js';

console.log('=== Running Detective Map Excalidraw Adapter Verification ===\n');

// Test 1: Gate 1 & Gate 2 - Converting Concepts & Edges to Excalidraw Elements
console.log('[Test 1] Converting 8 Concepts and 5 Edges into Excalidraw Elements...');
const elements = convertConceptsToExcalidraw(initialConcepts, initialEdges);

const rectElements = elements.filter(e => e.type === 'rectangle');
const arrowElements = elements.filter(e => e.type === 'arrow');
const textElements = elements.filter(e => e.type === 'text');

console.log(`  Total Excalidraw Elements: ${elements.length}`);
console.log(`  Rectangle Elements (Concept Nodes): ${rectElements.length}`);
console.log(`  Arrow Elements (Relationships): ${arrowElements.length}`);
console.log(`  Text Elements (Labels): ${textElements.length}`);

assert.strictEqual(rectElements.length, 8, 'Must generate exactly 8 concept rectangle elements');
assert.strictEqual(arrowElements.length, 5, 'Must generate exactly 5 relationship arrow elements');
console.log('  ✓ PASS: Gate 1 & 2 element counts match');

// Test 2: Checking customData and binding integrity
console.log('\n[Test 2] Verifying customData and binding integrity...');
rectElements.forEach(rect => {
  assert(rect.customData?.conceptId, `Rectangle ${rect.id} must have customData.conceptId`);
  assert(rect.customData?.isConceptNode, `Rectangle ${rect.id} must have isConceptNode flag`);
  assert(rect.roundness?.type === 3, `Rectangle ${rect.id} must have rounded styling`);
});

arrowElements.forEach(arrow => {
  assert(arrow.startBinding?.elementId, `Arrow ${arrow.id} must have startBinding`);
  assert(arrow.endBinding?.elementId, `Arrow ${arrow.id} must have endBinding`);
  assert(arrow.customData?.edgeId, `Arrow ${arrow.id} must have customData.edgeId`);
});
console.log('  ✓ PASS: Semantic metadata and arrow bindings properly configured');

// Test 3: Gate 3 - Coordinate Writeback Verification
console.log('\n[Test 3] Simulating user dragging "Spaced Repetition" node...');
const targetRect = rectElements.find(r => r.customData.conceptId === 'c_5d6601f0d6');
const originalX = targetRect.x;
const originalY = targetRect.y;

// Simulate dragging to new position
targetRect.x = 420;
targetRect.y = 350;

const { updatedConcepts, changes } = extractConceptPositions(elements, initialConcepts);
assert.strictEqual(changes.length, 1, 'Should detect exactly 1 moved concept');
assert.strictEqual(changes[0].id, 'c_5d6601f0d6');
assert.strictEqual(changes[0].new.x, 420);
assert.strictEqual(changes[0].new.y, 350);

const updatedConcept = updatedConcepts.find(c => c.id === 'c_5d6601f0d6');
assert.strictEqual(updatedConcept.x, 420);
assert.strictEqual(updatedConcept.y, 350);
console.log(`  ✓ PASS: Gate 3 coordinate writeback verified: (${originalX}, ${originalY}) -> (${updatedConcept.x}, ${updatedConcept.y})`);

// Test 4: Gate 5 - Element selection to Concept lookup
console.log('\n[Test 4] Resolving selected element to Concept model (Gate 5)...');
const foundConcept = findConceptByElementId(targetRect.id, elements, initialConcepts);
assert(foundConcept, 'Must find Concept by rectangle element ID');
assert.strictEqual(foundConcept.label, 'Spaced Repetition');
assert.strictEqual(foundConcept.sourceRefs.length, 3);
console.log(`  ✓ PASS: Gate 5 successfully resolved "${foundConcept.label}" with ${foundConcept.sourceRefs.length} sources`);

console.log('\n🎉 ALL ADAPTER TESTS PASSED SUCCESSFULLY!');
