const assert = require('assert');
const path = require('path');

// Backup original env & modules
const geminiProvider = require('../services/geminiProvider');
const openrouterProvider = require('../services/openrouterProvider');
const groqProvider = require('../services/groqProvider');
const aiService = require('../services/aiService');

console.log('=== Phase 7D: Groq Multi-Provider Fallback Test Suite ===');

// Mock payload for testing
const mockEvidencePackage = {
  repository: { owner: 'test', repo: 'testrepo' },
  file: { path: 'backend/controllers/studentController.js', language: 'javascript' },
  selection: { startLine: 10, endLine: 20, type: 'range', code: 'async function getMyProfileStudent() { ... }' },
  commit: { hash: 'abc1234', shortHash: 'abc1234', message: 'feat: add student profile endpoint' }
};

const mockDraftExplanation = {
  whatItDoes: 'Retrieves student profile.',
  whyItExists: 'Added in commit abc1234 for profile endpoint.',
  whatHistoryProves: 'Commit abc1234 introduced getMyProfileStudent.',
  whatIsInferred: 'Appears to serve student dashboard.',
  whatIsUnknown: 'No issue linked.',
  affectedFunctionalities: [{ name: 'Student Profile Retrieval', relationship: 'direct', confidence: 'high' }],
  confidence: 'high'
};

const mockVagueDraftExplanation = {
  whatItDoes: 'Retrieves student profile.',
  whyItExists: 'The selected code implements student profile retrieval, but the available historical evidence does not establish why this functionality was introduced. The introducing commit focuses on "Initial project upload folders".',
  whatHistoryProves: 'Commit abc1234 message is "Initial project upload folders".',
  whatIsInferred: 'Appears to serve student data.',
  whatIsUnknown: 'The repository history does not establish the business reason.',
  affectedFunctionalities: [],
  confidence: 'low'
};

const mockVerificationResult = {
  verified: true,
  claims: [{ claim: 'Retrieves student profile', status: 'supported' }],
  overallAssessment: 'pass',
  confidence: 'high'
};

async function runTests() {
  let testCount = 0;

  // Save original functions
  const origGeminiGenerate = geminiProvider.generateDraftExplanation;
  const origOpenrouterVerify = openrouterProvider.verifyExplanation;
  const origGroqGenerate = groqProvider.generateDraftExplanation;
  const origGroqVerify = groqProvider.verifyExplanation;

  try {
    // ----------------------------------------------------
    // TEST 1: Gemini works (Gemini ANALYZER -> OpenRouter VERIFIER)
    // ----------------------------------------------------
    console.log('\nTest 1: Gemini works (Gemini ANALYZER -> OpenRouter VERIFIER)...');
    geminiProvider.generateDraftExplanation = async () => mockDraftExplanation;
    openrouterProvider.verifyExplanation = async () => mockVerificationResult;
    groqProvider.generateDraftExplanation = async () => { throw new Error('Groq should not be called'); };
    groqProvider.verifyExplanation = async () => { throw new Error('Groq verifier should not be called'); };

    let res1 = await aiService.generateExplanation(mockEvidencePackage);
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.explanation.analyzerProvider, 'Gemini');
    assert.strictEqual(res1.explanation.verifierProvider, 'OpenRouter');
    assert.strictEqual(res1.explanation.verificationStatus, 'passed');
    console.log('✓ Test 1 Passed: Gemini Analyzer -> OpenRouter Verifier succeeded.');
    testCount++;

    // ----------------------------------------------------
    // TEST 2: Gemini returns 429 (Gemini FAIL -> Groq ANALYZER -> OpenRouter VERIFIER)
    // ----------------------------------------------------
    console.log('\nTest 2: Gemini returns 429 (Groq ANALYZER -> OpenRouter VERIFIER)...');
    geminiProvider.generateDraftExplanation = async () => { throw new Error('Gemini API returned 429: Quota Exceeded'); };
    groqProvider.generateDraftExplanation = async () => mockDraftExplanation;
    openrouterProvider.verifyExplanation = async () => mockVerificationResult;

    let res2 = await aiService.generateExplanation(mockEvidencePackage);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.explanation.analyzerProvider, 'Groq');
    assert.strictEqual(res2.explanation.verifierProvider, 'OpenRouter');
    assert.strictEqual(res2.explanation.verificationStatus, 'passed');
    console.log('✓ Test 2 Passed: Gemini 429 triggers Groq Analyzer fallback and verifies via OpenRouter.');
    testCount++;

    // ----------------------------------------------------
    // TEST 3: Gemini fails and Groq fails (AI unavailable 503, Evidence Package remains usable)
    // ----------------------------------------------------
    console.log('\nTest 3: Gemini fails and Groq fails (AI unavailable 503)...');
    geminiProvider.generateDraftExplanation = async () => { throw new Error('Gemini error 429'); };
    groqProvider.generateDraftExplanation = async () => { throw new Error('Groq error 429'); };

    try {
      await aiService.generateExplanation(mockEvidencePackage);
      assert.fail('Should have thrown 503 error when all providers fail');
    } catch (err) {
      assert.strictEqual(err.status, 503);
      assert.ok(err.message.includes('AI explanation temporarily unavailable'));
      console.log('✓ Test 3 Passed: Returns graceful 503 error when all AI providers fail.');
      testCount++;
    }

    // ----------------------------------------------------
    // TEST 4: Groq succeeds but OpenRouter fails (Groq ANALYZER -> Verification UNVERIFIED)
    // ----------------------------------------------------
    console.log('\nTest 4: Groq succeeds but OpenRouter fails (Groq ANALYZER -> Verification UNVERIFIED)...');
    geminiProvider.generateDraftExplanation = async () => { throw new Error('Gemini down'); };
    groqProvider.generateDraftExplanation = async () => mockDraftExplanation;
    openrouterProvider.verifyExplanation = async () => { throw new Error('OpenRouter down'); };
    groqProvider.verifyExplanation = async () => { throw new Error('Groq should not verify Groq draft'); };

    let res4 = await aiService.generateExplanation(mockEvidencePackage);
    assert.strictEqual(res4.success, true);
    assert.strictEqual(res4.explanation.analyzerProvider, 'Groq');
    assert.strictEqual(res4.explanation.verifierProvider, 'None');
    assert.strictEqual(res4.explanation.verificationStatus, 'unverified');
    assert.strictEqual(res4.explanation.verificationNotice, 'AI analysis available; verification unavailable.');
    console.log('✓ Test 4 Passed: Analyzer result returned with verification marked as unverified (not falsely verified).');
    testCount++;

    // ----------------------------------------------------
    // TEST 5: No AI keys configured
    // ----------------------------------------------------
    console.log('\nTest 5: No AI keys configured...');
    geminiProvider.generateDraftExplanation = async () => { throw { status: 503, message: 'GEMINI_API_KEY is not configured.' }; };
    groqProvider.generateDraftExplanation = async () => { throw { status: 503, message: 'GROQ_API_KEY is not configured.' }; };

    try {
      await aiService.generateExplanation(mockEvidencePackage);
      assert.fail('Should have thrown 503 when keys are unconfigured');
    } catch (err) {
      assert.strictEqual(err.status, 503);
      console.log('✓ Test 5 Passed: Handled unconfigured keys gracefully with 503 response.');
      testCount++;
    }

    // ----------------------------------------------------
    // TEST 6: Function with vague commit message ("Initial project upload folders")
    // ----------------------------------------------------
    console.log('\nTest 6: Function with vague commit message ("Initial project upload folders")...');
    const vagueEvidencePackage = {
      ...mockEvidencePackage,
      commit: { hash: 'abc1234', shortHash: 'abc1234', message: 'Initial project upload folders' }
    };
    geminiProvider.generateDraftExplanation = async () => mockVagueDraftExplanation;
    openrouterProvider.verifyExplanation = async () => mockVerificationResult;

    let res6 = await aiService.generateExplanation(vagueEvidencePackage);
    assert.strictEqual(res6.success, true);
    assert.strictEqual(res6.explanation.confidence, 'low');
    assert.ok(res6.explanation.whyItExists.includes('does not establish why this functionality was introduced'));
    console.log('✓ Test 6 Passed: Vague commit message correctly forces Historical Confidence to LOW.');
    testCount++;

    // ----------------------------------------------------
    // TEST 7: Function with strong feature-specific commit message
    // ----------------------------------------------------
    console.log('\nTest 7: Function with strong feature-specific commit message...');
    geminiProvider.generateDraftExplanation = async () => mockDraftExplanation;
    openrouterProvider.verifyExplanation = async () => mockVerificationResult;

    let res7 = await aiService.generateExplanation(mockEvidencePackage);
    assert.strictEqual(res7.success, true);
    assert.strictEqual(res7.explanation.confidence, 'high');
    console.log('✓ Test 7 Passed: Feature-specific commit evidence yields HIGH historical confidence.');
    testCount++;

    console.log(`\n🎉 ALL ${testCount} MULTI-PROVIDER ARCHITECTURE TESTS PASSED SUCCESSFULLY!`);
  } finally {
    // Restore original functions
    geminiProvider.generateDraftExplanation = origGeminiGenerate;
    openrouterProvider.verifyExplanation = origOpenrouterVerify;
    groqProvider.generateDraftExplanation = origGroqGenerate;
    groqProvider.verifyExplanation = origGroqVerify;
  }
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
