
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Message, GradeLevel, AppMode } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const getSystemInstruction = (mode: AppMode, isPro: boolean) => {
  let modeSpecific = "";
  
  switch(mode) {
    case AppMode.CONCEPT_EXPLAINER:
      modeSpecific = `SPECIAL MODE: 3-LEVEL EXPLANATION. 
      You must provide the explanation in three distinct tiers:
      1. For a 5-year old (Simplified metaphors)
      2. For a High Schooler (Core academic concepts)
      3. For a College Student (Technical depth and advanced theory)`;
      break;
    case AppMode.ERROR_CHECKER:
      modeSpecific = `SPECIAL MODE: ERROR CHECKER. 
      Analyze the user's input specifically looking for logical fallacies, calculation errors, or conceptual mistakes. 
      Be supportive but very precise in identifying where they went wrong.`;
      break;
    case AppMode.ESSAY_DRAFT:
      modeSpecific = `SPECIAL MODE: ESSAY DRAFT. 
      Focus on structure, thesis statement development, and argumentative flow. 
      Provide an outline first, followed by draft paragraphs.`;
      break;
    default:
      modeSpecific = "NORMAL ASSISTANT MODE. Be helpful and accurate.";
  }

  const practiceRule = isPro 
    ? "=== PRACTICE QUESTIONS ===\n[Provide 2-3 similar practice problems to reinforce learning]"
    : "=== PRACTICE QUESTIONS ===\n[Upgrade to SnapSolve Pro to unlock personalized practice questions!]";

  return `You are SnapSolve AI, an advanced homework assistant for US high school and college students.

${modeSpecific}

Your responsibilities:
- Solve academic problems accurately using high-level reasoning.
- Show step-by-step solutions when required.
- Explain concepts clearly and simply.
- Adjust difficulty level based on the provided grade level.
- Never fabricate unknown facts.
- Perform OCR/Document analysis on uploaded images or PDFs.

Output Structure (MANDATORY):
You MUST use these exact headers for every response:

=== SUBJECT ===
[Subject: Math, Physics, Chemistry, Biology, English, History, Computer Science, or Other] | [Confidence: 0-100%]

=== PROBLEM UNDERSTANDING ===
[Briefly describe the task, the goal, and any provided information]

=== STEP-BY-STEP SOLUTION ===
[Detailed, logical steps leading to the answer]

=== FINAL ANSWER ===
[The clear and concise result]

=== WHY THIS METHOD WORKS ===
[The underlying principle or key concept that explains the "why"]

=== VISUAL AID PROMPTS ===
[If helpful, provide 2-4 short, descriptive prompts for diagrams, graphs, or historical illustrations that would clarify the answer. If not needed, say "None". Format: PROMPT: {description}]

${practiceRule}

Rules:
- ALWAYS include all sections.
- For Math: show formulas using markdown latex: $$ formula $$.
- Keep tone supportive and professional.`;
};

export const solveProblem = async (
  prompt: string,
  gradeLevel: GradeLevel,
  history: Message[],
  mode: AppMode,
  isPro: boolean,
  mediaData?: { data: string; mimeType: string }
): Promise<string> => {
  const model = 'gemini-3-pro-preview';
  
  const historyParts = history.slice(-6).map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }]
  }));

  const userParts: any[] = [
    { text: `Grade Level Context: ${gradeLevel}\nSelected Mode: ${mode}\n\nStudent Input: ${prompt || "Please analyze the attached file."}` }
  ];
  
  if (mediaData) {
    userParts.push({
      inlineData: {
        mimeType: mediaData.mimeType,
        data: mediaData.data.split(',')[1] 
      }
    });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        ...historyParts.map(h => ({ role: h.role as "user" | "model", parts: h.parts })),
        { role: 'user', parts: userParts }
      ],
      config: {
        systemInstruction: getSystemInstruction(mode, isPro),
        temperature: 0.4,
      }
    });

    return response.text || "I'm sorry, I couldn't generate a solution. Please try again.";
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return "SnapSolve AI encountered an error. Please check the file quality and try again.";
  }
};

export const generateVisualAid = async (prompt: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `Educational diagram or illustration for: ${prompt}. Clean, labeled, academic style.` }]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Image generation error:", error);
    return null;
  }
};
