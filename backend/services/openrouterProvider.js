const path = require('path');

/**
 * Service to verify AI explanations using OpenRouter
 */
async function verifyExplanation(sanitizedPayload, draftExplanation) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    console.warn('[OpenRouterProvider] Verification unavailable. OPENROUTER_API_KEY is not configured.');
    throw {
      status: 503,
      message: 'OpenRouter verification unavailable. OPENROUTER_API_KEY is not configured.'
    };
  }

  const systemInstruction = `You are an evidence verification model for a software archaeology system.

You receive:
1. Repository Evidence
2. An AI-generated draft explanation

Your job is to verify the draft ONLY against the supplied repository evidence.

Do not use outside knowledge.
Do not invent missing facts.

For every important claim determine:
SUPPORTED
INFERENCE
UNSUPPORTED

A claim is SUPPORTED only when the supplied evidence directly supports it.
A claim is INFERENCE when it is a reasonable interpretation but is not explicitly established by historical evidence.
A claim is UNSUPPORTED when the evidence does not justify it.

Pay special attention to the distinction between:
WHAT CODE DOES
and:
WHY THE CODE WAS HISTORICALLY INTRODUCED.

Do not assume that the purpose of code is the historical reason it was created.
Do not infer business requirements from code alone.
Do not invent PRs, Issues, users, requirements, or developer intentions.

Verify all claims about Affected Functionalities:
- If the draft claims a functionality depends on the selected code (e.g. "Practice Dashboard depends directly on submitPracticeLog"), check if the evidence payload explicitly supports this relationship.
- If no evidence exists in the payload, mark the claim as UNSUPPORTED and recommend a correction or removal of the claim.
- Set overallAssessment to "needs_revision" whenever an unsupported functionality claim is made.

If a claim is unsupported, recommend a corrected statement.

The evidence is the source of truth.

You MUST format your response as a valid JSON object matching this EXACT schema:
{
  "verified": true,
  "claims": [
    {
      "claim": "The claim being evaluated",
      "status": "supported | inference | unsupported",
      "evidence": "Brief description of supporting evidence, or null if unsupported",
      "correction": "Recommended correction if unsupported, or null"
    }
  ],
  "overallAssessment": "pass | needs_revision",
  "confidence": "high | medium | low"
}

If all important claims are supported or valid inferences, set overallAssessment to "pass".
If one or more important historical or functionality claims are unsupported, set overallAssessment to "needs_revision".

Return ONLY the JSON object.
Do not return markdown.
Do not return code block formatting.
Do not return explanations outside JSON.
Do not return reasoning outside JSON.
Do not include a preamble.
Do not include a conclusion outside JSON.
Your entire response must be one valid JSON object.`;

  // Helper to strictly truncate strings
  function truncate(str, max) {
    if (!str || typeof str !== 'string') return '';
    return str.length <= max ? str : str.slice(0, max) + '... [truncated]';
  }

  // Create heavily reduced payload for the verifier
  const verifierPayload = {
    selectedCode: truncate(sanitizedPayload.selectedCode, 8000),
    introducingCommit: sanitizedPayload.introducingCommit ? {
      ...sanitizedPayload.introducingCommit,
      message: truncate(sanitizedPayload.introducingCommit.message, 1000)
    } : null,
    diffContent: truncate(sanitizedPayload.diffContent, 8000),
    fileHistorySummary: (sanitizedPayload.fileHistorySummary || []).slice(0, 5),
    pullRequests: (sanitizedPayload.pullRequests || []).map(pr => ({
      ...pr,
      body: truncate(pr.body, 3000)
    })),
    issues: (sanitizedPayload.issues || []).map(iss => ({
      ...iss,
      body: truncate(iss.body, 3000)
    })),
    impactEvidence: sanitizedPayload.impactEvidence ? {
      directCallers: (sanitizedPayload.impactEvidence.directCallers || []).slice(0, 5),
      possibleReferences: (sanitizedPayload.impactEvidence.possibleReferences || []).slice(0, 5),
      directDependencies: (sanitizedPayload.impactEvidence.directDependencies || []).slice(0, 5),
      routes: (sanitizedPayload.impactEvidence.routes || []).slice(0, 5),
      historicallyCoChanged: (sanitizedPayload.impactEvidence.historicallyCoChanged || []).slice(0, 5),
      affectedFunctionalities: sanitizedPayload.impactEvidence.affectedFunctionalities || [],
      removalImpact: sanitizedPayload.impactEvidence.removalImpact || null,
      modificationImpact: sanitizedPayload.impactEvidence.modificationImpact || null
    } : null
  };

  const verifierDraft = {
    ...draftExplanation,
    whatItDoes: truncate(draftExplanation.whatItDoes, 6000),
    whyItExists: truncate(draftExplanation.whyItExists, 6000),
    whatHistoryProves: truncate(draftExplanation.whatHistoryProves, 6000),
    whatIsInferred: truncate(draftExplanation.whatIsInferred, 6000),
    whatIsUnknown: truncate(draftExplanation.whatIsUnknown, 6000),
    whatChanged: truncate(draftExplanation.whatChanged, 3000),
    potentialImpact: truncate(draftExplanation.potentialImpact, 3000),
    affectedFunctionalities: draftExplanation.affectedFunctionalities || [],
    removalAnalysis: draftExplanation.removalAnalysis || '',
    modificationAnalysis: draftExplanation.modificationAnalysis || ''
  };

  const promptText = `Here is the Repository Evidence:

${JSON.stringify(verifierPayload, null, 2)}

---

Here is the AI-generated draft explanation:

${JSON.stringify(verifierDraft, null, 2)}

Verify the draft against the evidence and return your assessment as a JSON object.`;

  try {
    console.log('[OpenRouterProvider] Starting verification');
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
        'X-Title': 'Codebase Time Traveler'
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        max_tokens: 4000,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: promptText }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[OpenRouterProvider] API error (${response.status}):`, errText);
      if (response.status === 402) {
        return {
          verified: false,
          verificationStatus: "unavailable",
          reason: "OpenRouter token budget exceeded"
        };
      }
      throw new Error(`OpenRouter API returned ${response.status}: ${errText}`);
    }

    const resData = await response.json();
    const candidateText = resData?.choices?.[0]?.message?.content;

    if (!candidateText) {
      console.warn('[OpenRouterProvider] Empty text from model');
      throw new Error('Empty text from OpenRouter model');
    }

    // Parse JSON from model output
    let parsed;
    try {
      let cleanedJson = candidateText.trim();
      // First attempt to extract just the JSON block if it has preamble/postamble
      const firstBrace = cleanedJson.indexOf('{');
      const lastBrace = cleanedJson.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
        cleanedJson = cleanedJson.substring(firstBrace, lastBrace + 1);
      }
      parsed = JSON.parse(cleanedJson);
    } catch (parseErr) {
      console.error('[OpenRouterProvider] Failed to parse AI JSON response:', candidateText);
      throw new Error('Received malformed JSON response from OpenRouter');
    }

    console.log('[OpenRouterProvider] Verification succeeded');
    return parsed;
  } catch (err) {
    console.warn(`[OpenRouterProvider] Verification failed: ${err.message}`);
    throw err;
  }
}

module.exports = {
  verifyExplanation
};
