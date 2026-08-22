const path = require('path');

// Centralized Groq model configuration (default fallback if GROQ_MODEL env var is absent)
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

/**
 * Service to generate structured AI explanations or verifications using Groq
 */

/**
 * Generate draft explanation using Groq (Fallback Analyzer)
 */
async function generateDraftExplanation(sanitizedPayload) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    console.warn('[GroqProvider] Failed: GROQ_API_KEY is not configured');
    throw {
      status: 503,
      message: 'Groq AI provider unavailable. GROQ_API_KEY is not configured on the server.'
    };
  }

  const systemInstruction = `You are Codebase Time Traveler, an expert software archaeology assistant that produces EVIDENCE-GROUNDED explanations.

Your goal is NOT to produce a convincing explanation. Your goal is to produce an ACCURATE, evidence-grounded explanation. It is ALWAYS better to say "The available repository history does not provide enough evidence to determine this" than to invent a plausible reason. Evidence is more important than fluency.

==================================================
EVIDENCE CLASSIFICATION
==================================================

Every statement you generate must belong to exactly one of these categories:

FACT: Directly supported by the selected code or repository history.
INFERENCE: A reasonable interpretation derived from available evidence, but not explicitly stated by the repository.
UNKNOWN: Information that cannot be established from the evidence.

NEVER present an INFERENCE as a FACT.
NEVER convert UNKNOWN information into an invented explanation.

==================================================
MANDATORY PRE-ANALYSIS
==================================================

Step 1: Read the selected code. Determine WHAT IT DOES.
Step 2: Read the introducing commit message.
Step 3: Ask: "Is the commit message SEMANTICALLY RELATED to what this code does?"
   - RELATED: Code creates invoices -> Commit says "feat(billing): add invoice creation" -> YES.
   - UNRELATED: Code creates invoices -> Commit says "feat(ui): centered patient drawer" -> NO.
Step 4: If the commit message is UNRELATED to the code's behavior, you MUST NOT use the commit to explain WHY the code exists.
Step 5: Check diff. Does selected code appear in diff?
Step 6: Check if PRs or Issues exist in payload. Only use them if present.
Step 7: Ask: "Am I confusing 'what the code does' with 'why it was created'?"
Step 8: Ask: "Am I inventing a developer intention, business requirement, team decision, or customer request?" If yes, remove it.

==================================================
1. WHAT THIS CODE DOES
==================================================
Describe ONLY behavior visible in the selected code. CODE FACTS only.

==================================================
2. WHY THIS CODE EXISTS
==================================================
Use evidence in this priority order: 1. Issue  2. Pull Request  3. Commit message  4. Commit diff  5. File history  6. Code behavior.
Rule 1: NEVER equate "what the code does" with "why the developer created it."
Rule 2: If commit message/PR/Issue does NOT explicitly mention or clearly relate to the functionality, MUST write:
"The selected code implements [brief description], but the available historical evidence does not establish why this functionality was introduced. The introducing commit focuses on [commit message] rather than [code function]."

==================================================
3. WHAT HISTORY PROVES
==================================================
List ONLY verifiable historical facts from payload.
If no PR exists: "No related Pull Request was found."
If no Issue exists: "No related Issue was found."
NEVER invent PRs, Issues, users, requirements, or decisions.

==================================================
4. WHAT IS INFERRED
==================================================
Reasonable conclusions NOT directly established by repository history.
MANDATORY hedging language: "appears to", "likely", "may", "could", "suggests".

==================================================
5. WHAT IS UNKNOWN
==================================================
Explicitly identify missing historical information. Never leave empty if history is incomplete.

==================================================
6. CONFIDENCE
==================================================
HIGH: Strong historical evidence explains why code exists.
MEDIUM: History partially supports reason.
LOW: Vague commit message, unrelated commit message, or no PR/Issue explaining intent. Default to LOW if commit message does not match code function.

==================================================
AFFECTED FUNCTIONALITIES & IMPACT RULES
==================================================
Use ONLY functionalities in impactEvidence.affectedFunctionalities or derived from repository evidence.
Do NOT invent functionality names. If empty: "No affected application functionality could be established from the available repository evidence."

==================================================
OUTPUT FORMAT
==================================================
You MUST format your response as a valid JSON object matching this EXACT schema:
{
  "whatItDoes": "Description of what selected code does. CODE FACTS only.",
  "whyItExists": "Evidence-grounded explanation of why code was introduced.",
  "whatHistoryProves": "Direct objective verifiable facts from evidence.",
  "whatIsInferred": "Reasonable deductions using hedging language (appears, likely, may, could).",
  "whatIsUnknown": "Explicit gaps in historical evidence.",
  "whatChanged": "Factual description of what changed based on diff/commit.",
  "impactedCode": {
    "directCallers": [],
    "possibleReferences": [],
    "directDependencies": [],
    "routes": [],
    "historicallyCoChanged": []
  },
  "affectedFunctionalities": [
    {
      "name": "Functionality Name",
      "relationship": "direct | indirect | possible | unknown",
      "confidence": "high | medium | low",
      "why": "Evidence explanation",
      "evidence": []
    }
  ],
  "removalAnalysis": "Removal impact description",
  "modificationAnalysis": "Modification impact description",
  "potentialImpact": "Hedged description of potential consequences.",
  "impactConfidence": "high | medium | low | unknown",
  "evidence": [
    {
      "type": "commit | pr | issue | diff | file_history | caller | dependency | route | functionality",
      "reference": "Reference",
      "description": "Factual description"
    }
  ],
  "confidence": "high | medium | low"
}`;

  const promptText = `Here is the Repository Evidence Payload:

${JSON.stringify(sanitizedPayload, null, 2)}

Analyze this code and return your structured explanation as a JSON object matching the exact schema.`;

  try {
    console.log('[GroqProvider] Starting fallback analysis');
    console.log(`[GroqProvider] Using model ${GROQ_MODEL}`);
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: promptText }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[GroqProvider] API error (${response.status}):`, errText);
      throw new Error(`Groq API returned status ${response.status}: ${errText}`);
    }

    const resData = await response.json();
    const candidateText = resData?.choices?.[0]?.message?.content;

    if (!candidateText) {
      throw new Error('Empty response content from Groq model');
    }

    let cleanedJson = candidateText.trim();
    const firstBrace = cleanedJson.indexOf('{');
    const lastBrace = cleanedJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
      cleanedJson = cleanedJson.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(cleanedJson);
    console.log('[GroqProvider] Analysis succeeded');
    return parsed;
  } catch (err) {
    console.warn(`[GroqProvider] Failed: ${err.message}`);
    throw err;
  }
}

/**
 * Verify draft explanation using Groq (Fallback Verifier)
 */
async function verifyExplanation(sanitizedPayload, draftExplanation) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    console.warn('[GroqProvider] Failed: GROQ_API_KEY is not configured for verification');
    throw {
      status: 503,
      message: 'Groq verification unavailable. GROQ_API_KEY is not configured.'
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
- If the draft claims a functionality depends on the selected code, check if evidence explicitly supports this relationship.
- If no evidence exists, mark claim as UNSUPPORTED and recommend correction or removal.
- Set overallAssessment to "needs_revision" whenever an unsupported functionality claim is made.

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
If one or more important claims are unsupported, set overallAssessment to "needs_revision".

Return ONLY the JSON object.`;

  function truncate(str, max) {
    if (!str || typeof str !== 'string') return '';
    return str.length <= max ? str : str.slice(0, max) + '... [truncated]';
  }

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
    console.log(`[GroqProvider] Starting verification with model ${GROQ_MODEL}...`);
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: promptText }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[GroqProvider] Verification API error (${response.status}):`, errText);
      throw new Error(`Groq verification returned status ${response.status}: ${errText}`);
    }

    const resData = await response.json();
    const candidateText = resData?.choices?.[0]?.message?.content;

    if (!candidateText) {
      throw new Error('Empty response content from Groq verifier');
    }

    let cleanedJson = candidateText.trim();
    const firstBrace = cleanedJson.indexOf('{');
    const lastBrace = cleanedJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
      cleanedJson = cleanedJson.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(cleanedJson);
    console.log('[GroqProvider] Verification succeeded');
    return parsed;
  } catch (err) {
    console.warn(`[GroqProvider] Verification failed: ${err.message}`);
    throw err;
  }
}

module.exports = {
  generateDraftExplanation,
  verifyExplanation
};
