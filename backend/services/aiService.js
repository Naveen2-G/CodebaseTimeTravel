const path = require('path');
const geminiProvider = require('./geminiProvider');
const openrouterProvider = require('./openrouterProvider');
const groqProvider = require('./groqProvider');

/**
 * Safely truncate text to avoid token overflow
 */
function truncateText(text, maxLength = 2500) {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\n... [truncated for length]';
}

/**
 * Reconcile draft explanation with verifier output
 */
function reconcileVerification(draft, verificationResult) {
  let finalExplanation = { ...draft };
  let status = 'passed';
  
  if (verificationResult.verificationStatus === 'unavailable') {
    status = 'unverified';
    finalExplanation.verificationNotice = 'AI analysis available; verification unavailable.';
  } else if (verificationResult.overallAssessment === 'needs_revision') {
    status = 'corrected';
    const unsupportedClaims = (verificationResult.claims || []).filter(c => c.status === 'unsupported');
    
    if (unsupportedClaims.length > 0) {
      // Modify the 'whyItExists' section to reflect that unsupported claims were removed
      finalExplanation.whyItExists = "The selected code implements this functionality, but the available repository history does not establish why it was originally introduced. Previous AI inferences were not supported by the evidence.";
      
      // Filter out unsupported functionality claims if any were flagged
      if (Array.isArray(finalExplanation.affectedFunctionalities)) {
        const unsupportedTexts = unsupportedClaims.map(c => (c.claim || '').toLowerCase());
        finalExplanation.affectedFunctionalities = finalExplanation.affectedFunctionalities.filter(fn => {
          return !unsupportedTexts.some(ut => ut.includes(fn.name.toLowerCase()));
        });
      }

      // Append corrections from the verifier to whatIsUnknown
      const corrections = unsupportedClaims
        .filter(c => c.correction)
        .map(c => c.correction)
        .join(' ');
        
      if (corrections) {
         finalExplanation.whatIsUnknown = (finalExplanation.whatIsUnknown || '') + " Verification note: " + corrections;
      }
    }
  }

  finalExplanation.verificationStatus = status;
  return finalExplanation;
}

/**
 * Service to generate structured AI explanations using multi-provider fallback (Gemini, OpenRouter, Groq)
 */
async function generateExplanation(evidencePackage, impactEvidence = null) {
  if (!evidencePackage || !evidencePackage.file || !evidencePackage.selection) {
    throw {
      status: 400,
      message: 'Invalid evidence package provided to AI service.'
    };
  }

  // 1. Prepare sanitized & truncated evidence payload for prompt
  const sanitizedPayload = {
    repository: evidencePackage.repository || {},
    file: {
      path: evidencePackage.file.path,
      language: evidencePackage.file.language
    },
    selection: {
      startLine: evidencePackage.selection.startLine,
      endLine: evidencePackage.selection.endLine,
      type: evidencePackage.selection.type
    },
    selectedCode: truncateText(evidencePackage.selection.code, 3000),
    introducingCommit: evidencePackage.commit ? {
      hash: evidencePackage.commit.hash,
      shortHash: evidencePackage.commit.shortHash,
      message: evidencePackage.commit.message,
      author: evidencePackage.commit.author,
      date: evidencePackage.commit.date,
      filesChanged: (evidencePackage.commit.filesChanged || []).slice(0, 10)
    } : null,
    uniqueCommitsInRange: (evidencePackage.uniqueCommits || []).map(c => ({
      hash: c.shortHash || (c.hash && c.hash.slice(0, 7)),
      message: c.message,
      author: c.author,
      date: c.date
    })),
    diffContent: truncateText(evidencePackage.diff ? evidencePackage.diff.content : '', 3000),
    pullRequests: (evidencePackage.pullRequests || []).map(pr => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      merged: pr.merged,
      body: truncateText(pr.body || '', 500)
    })),
    issues: (evidencePackage.issues || []).map(issue => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      body: truncateText(issue.body || '', 500)
    })),
    fileHistorySummary: (evidencePackage.fileHistory || []).slice(0, 5).map(h => ({
      hash: h.shortHash || h.hash.slice(0, 7),
      message: h.message,
      date: h.date
    })),
    impactEvidence: impactEvidence ? {
      change: impactEvidence.change,
      directCallers: (impactEvidence.directCallers || []).slice(0, 5),
      directDependencies: (impactEvidence.directDependencies || []).slice(0, 5),
      routes: (impactEvidence.routes || []).slice(0, 5),
      relatedFiles: (impactEvidence.relatedFiles || []).slice(0, 5),
      historicallyCoChanged: (impactEvidence.historicallyCoChanged || []).slice(0, 5),
      affectedFunctionalities: impactEvidence.affectedFunctionalities || [],
      functionalityGraph: impactEvidence.functionalityGraph || null,
      removalImpact: impactEvidence.removalImpact || null,
      modificationImpact: impactEvidence.modificationImpact || null,
      noFunctionalityMessage: impactEvidence.noFunctionalityMessage || null,
      impactLevel: impactEvidence.impactLevel,
      impactConfidence: impactEvidence.impactConfidence
    } : null
  };

  // 2. Multi-provider Analyzer Fallback (Primary: Gemini -> Fallback: Groq)
  let draftExplanation;
  let analyzerProvider = 'gemini';

  try {
    draftExplanation = await geminiProvider.generateDraftExplanation(sanitizedPayload);
  } catch (geminiErr) {
    console.warn('[aiService] Gemini Analyzer unavailable or failed:', geminiErr.message || geminiErr);
    console.log('[aiService] Falling back to Groq Analyzer...');
    try {
      draftExplanation = await groqProvider.generateDraftExplanation(sanitizedPayload);
      analyzerProvider = 'groq';
    } catch (groqErr) {
      console.error('[aiService] Groq Analyzer also failed:', groqErr.message || groqErr);
      throw {
        status: 503,
        message: 'AI explanation temporarily unavailable. All AI analyzer providers failed or are unconfigured.'
      };
    }
  }

  // 3. Multi-provider Independent Verifier Selection
  // Independence requirement: Groq draft cannot be verified by Groq verifier.
  let verificationResult = null;

  if (analyzerProvider === 'gemini') {
    // Primary verifier: OpenRouter; Fallback verifier: Groq
    try {
      verificationResult = await openrouterProvider.verifyExplanation(sanitizedPayload, draftExplanation);
    } catch (openrouterErr) {
      console.warn('[aiService] OpenRouter verifier failed:', openrouterErr.message || openrouterErr);
      console.log('[aiService] Falling back to Groq Verifier for Gemini draft...');
      try {
        verificationResult = await groqProvider.verifyExplanation(sanitizedPayload, draftExplanation);
      } catch (groqVerifyErr) {
        console.warn('[aiService] Groq verifier also failed:', groqVerifyErr.message || groqVerifyErr);
      }
    }
  } else if (analyzerProvider === 'groq') {
    // Independent verifier: OpenRouter only
    try {
      verificationResult = await openrouterProvider.verifyExplanation(sanitizedPayload, draftExplanation);
    } catch (openrouterErr) {
      console.warn('[aiService] OpenRouter verifier failed for Groq draft. No independent verifier available:', openrouterErr.message || openrouterErr);
    }
  }

  // 4. Reconcile final result
  if (verificationResult && verificationResult.verificationStatus !== 'unavailable') {
    const finalResult = reconcileVerification(draftExplanation, verificationResult);
    return {
      success: true,
      explanation: finalResult
    };
  } else {
    return {
      success: true,
      explanation: {
        ...draftExplanation,
        verificationStatus: 'unverified',
        verificationNotice: 'AI analysis available; verification unavailable.'
      }
    };
  }
}

module.exports = {
  generateExplanation
};
