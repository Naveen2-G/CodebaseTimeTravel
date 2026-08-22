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
    // TEST 1: Normal Flow (Gemini Analyzer + OpenRouter Verifier)
    // ----------------------------------------------------
    console.log('\nTest 1: Normal Flow (Gemini -> OpenRouter)...');
    geminiProvider.generateDraftExplanation = async () => mockDraftExplanation;
    openrouterProvider.verifyExplanation = async () => mockVerificationResult;
    groqProvider.generateDraftExplanation = async () => { throw new Error('Groq should not be called'); };
    groqProvider.verifyExplanation = async () => { throw new Error('Groq verifier should not be called'); };

    let res1 = await aiService.generateExplanation(mockEvidencePackage);
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.explanation.verificationStatus, 'passed');
    console.log('✓ Test 1 Passed: Normal flow produces verified status via OpenRouter.');
    testCount++;

    // ----------------------------------------------------
    // TEST 2: Gemini Failure Flow (Groq Analyzer + OpenRouter Verifier)
    // ----------------------------------------------------
    console.log('\nTest 2: Gemini Failure Flow (Groq Analyzer -> OpenRouter Verifier)...');
    geminiProvider.generateDraftExplanation = async () => { throw new Error('Gemini API quota exceeded'); };
    groqProvider.generateDraftExplanation = async () => mockDraftExplanation;
    openrouterProvider.verifyExplanation = async () => mockVerificationResult;

    let res2 = await aiService.generateExplanation(mockEvidencePackage);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.explanation.verificationStatus, 'passed');
    console.log('✓ Test 2 Passed: Gemini failure falls back to Groq Analyzer and verifies via OpenRouter.');
    testCount++;

    // ----------------------------------------------------
    // TEST 3: OpenRouter Failure Flow (Gemini Analyzer -> Groq Verifier)
    // ----------------------------------------------------
    console.log('\nTest 3: OpenRouter Failure Flow (Gemini Analyzer -> Groq Verifier)...');
    geminiProvider.generateDraftExplanation = async () => mockDraftExplanation;
    openrouterProvider.verifyExplanation = async () => { throw new Error('OpenRouter token budget exceeded'); };
    groqProvider.verifyExplanation = async () => mockVerificationResult;

    let res3 = await aiService.generateExplanation(mockEvidencePackage);
    assert.strictEqual(res3.success, true);
    assert.strictEqual(res3.explanation.verificationStatus, 'passed');
    console.log('✓ Test 3 Passed: OpenRouter failure falls back to Groq Verifier for Gemini draft.');
    testCount++;

    // ----------------------------------------------------
    // TEST 4: Gemini + OpenRouter Failure Flow (Groq Analyzer -> Unverified)
    // ----------------------------------------------------
    console.log('\nTest 4: Gemini + OpenRouter Failure Flow (Groq Analyzer -> Unverified)...');
    geminiProvider.generateDraftExplanation = async () => { throw new Error('Gemini down'); };
    groqProvider.generateDraftExplanation = async () => mockDraftExplanation;
    openrouterProvider.verifyExplanation = async () => { throw new Error('OpenRouter down'); };
    // Independence rule check: Groq verifier MUST NOT verify Groq analyzer draft
    groqProvider.verifyExplanation = async () => { throw new Error('Groq should not verify Groq draft'); };

    let res4 = await aiService.generateExplanation(mockEvidencePackage);
    assert.strictEqual(res4.success, true);
    assert.strictEqual(res4.explanation.verificationStatus, 'unverified');
    assert.strictEqual(res4.explanation.verificationNotice, 'AI analysis available; verification unavailable.');
    console.log('✓ Test 4 Passed: Groq analyzer draft remains UNVERIFIED when no independent verifier is available.');
    testCount++;

    // ----------------------------------------------------
    // TEST 5: All Providers Failure Flow (Throws 503)
    // ----------------------------------------------------
    console.log('\nTest 5: All Providers Failure Flow (Throws 503)...');
    geminiProvider.generateDraftExplanation = async () => { throw new Error('Gemini error'); };
    groqProvider.generateDraftExplanation = async () => { throw new Error('Groq error'); };

    try {
      await aiService.generateExplanation(mockEvidencePackage);
      assert.fail('Should have thrown error when all providers fail');
    } catch (err) {
      assert.strictEqual(err.status, 503);
      assert.ok(err.message.includes('AI explanation temporarily unavailable'));
      console.log('✓ Test 5 Passed: Returns graceful 503 error when all AI providers fail.');
      testCount++;
    }

    console.log(`\n🎉 ALL ${testCount} MULTI-PROVIDER FALLBACK TESTS PASSED SUCCESSFULLY!`);
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
