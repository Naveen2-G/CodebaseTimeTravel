const path = require('path');

/**
 * Safely truncate text to avoid token overflow
 */
function truncateText(text, maxLength = 2000) {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\n... [truncated for length]';
}

/**
 * Service to generate AI explanations for why code exists using Gemini
 */
async function generateExplanation(evidencePackage) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    throw {
      status: 503,
      message: 'AI explanation temporarily unavailable. GEMINI_API_KEY is not configured on the server.'
    };
  }

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
    selectedCode: truncateText(evidencePackage.selection.code, 2500),
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
    diffContent: truncateText(evidencePackage.diff ? evidencePackage.diff.content : '', 2000),
    pullRequests: (evidencePackage.pullRequests || []).map(pr => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      merged: pr.merged
    })),
    issues: (evidencePackage.issues || []).map(issue => ({
      number: issue.number,
      title: issue.title,
      state: issue.state
    })),
    fileHistorySummary: (evidencePackage.fileHistory || []).slice(0, 5).map(h => ({
      hash: h.shortHash || h.hash.slice(0, 7),
      message: h.message,
      date: h.date
    }))
  };

  const systemInstruction = `You are Codebase Time Traveler, a software archaeology assistant.

Your job is to explain why a selected piece of code exists using repository evidence.

You MUST prioritize historical evidence over assumptions.

You MUST NOT invent:
- commits
- pull requests
- issues
- authors
- dates
- requirements
- architectural decisions
- business requirements

If the evidence does not establish the original reason (e.g., if commit messages are vague like "update", "fix", or "add files"), explicitly state that the original reason cannot be determined with confidence.

Separate facts from inference.
Explain the code in terms that are useful to a developer who is new to this repository.

Answer:
1. What does this code do?
2. Why was it likely introduced?
3. What historical evidence supports that explanation?
4. How confident are you? (Allowed values: "high", "medium", "low")

Do not discuss what happens if the code is deleted.

Respond ONLY with valid JSON matching this exact JSON schema:
{
  "whatItDoes": "Concise summary of what the code does",
  "whyItExists": "Explanation of why the code was introduced based on evidence",
  "evidence": [
    {
      "type": "commit",
      "reference": "Commit SHA or PR/Issue #",
      "description": "Description of evidence item"
    }
  ],
  "confidence": "high"
}`;

  const promptText = `${systemInstruction}

Here is the Evidence Package for the selected code:

${JSON.stringify(sanitizedPayload, null, 2)}

Provide your response in JSON format.`;

  // Try calling Gemini models in order of availability
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: promptText }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`Gemini model ${model} API error (${response.status}):`, errText);
        lastError = new Error(`Gemini API returned ${response.status}`);
        continue;
      }

      const resData = await response.json();
      const candidateText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!candidateText) {
        console.warn(`Empty text from Gemini model ${model}`);
        continue;
      }

      // Parse JSON from model output
      let parsed;
      try {
        const cleanedJson = candidateText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        parsed = JSON.parse(cleanedJson);
      } catch (parseErr) {
        console.error('Failed to parse AI JSON response:', candidateText);
        throw { status: 500, message: 'Received malformed response from AI provider.' };
      }

      // Validate required response fields
      const confidenceLower = (parsed.confidence || 'medium').toLowerCase();
      const validConfidence = ['high', 'medium', 'low'].includes(confidenceLower) ? confidenceLower : 'medium';

      return {
        success: true,
        explanation: {
          whatItDoes: parsed.whatItDoes || 'No description provided.',
          whyItExists: parsed.whyItExists || 'The available repository history does not provide enough evidence to determine the original reason.',
          evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
          confidence: validConfidence
        }
      };
    } catch (err) {
      if (err.status) throw err;
      lastError = err;
    }
  }

  console.error('All Gemini API models failed:', lastError);
  throw {
    status: 503,
    message: 'AI explanation temporarily unavailable.'
  };
}

module.exports = {
  generateExplanation
};
