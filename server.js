import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 1. Generate Structured Lesson, Diagram & Quiz
app.post('/api/generate-lesson', async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required' });

    const systemInstruction = `You are an expert AI Educator. Given a topic or educational concept, break it down into an easy-to-understand lesson. You MUST respond with strict structured JSON matching the requested schema. Ensure the mermaid_code is a valid, simple top-down flowchart (graph TD) showing key relationships without syntax errors.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Explain this topic clearly: ${topic}`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            key_concepts: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            mermaid_code: { type: Type.STRING, description: "Valid Mermaid.js graph TD diagram string" },
            quiz: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING }
                },
                required: ["question", "options", "correctIndex", "explanation"]
              }
            }
          },
          required: ["title", "summary", "key_concepts", "mermaid_code", "quiz"]
        }
      }
    });

    const lessonData = JSON.parse(response.text);
    res.json(lessonData);
  } catch (err) {
    console.error('Error generating lesson:', err);
    res.status(500).json({ error: 'Failed to generate lesson content.' });
  }
});

// 2. Socratic Chatbot Endpoint
app.post('/api/socratic-chat', async (req, res) => {
  try {
    const { topic, chatHistory, userMessage } = req.body;

    const systemInstruction = `You are a Socratic AI Tutor teaching the topic: "${topic}". 
CRITICAL RULE: NEVER directly give the answer to the student's question. Always reply with a helpful hint, a probing question, or a simple guiding thought that pushes the user to think logically and deduce the answer themselves. Keep responses concise (2-3 sentences max).`;

    const formattedHistory = (chatHistory || []).map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n');
    const prompt = `Previous Conversation:\n${formattedHistory}\n\nSTUDENT: ${userMessage}\nSOCRATIC TUTOR:`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { systemInstruction }
    });

    res.json({ reply: response.text });
  } catch (err) {
    console.error('Error in Socratic chat:', err);
    res.status(500).json({ error: 'Failed to answer student query.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 ConceptLens AI running on http://localhost:${PORT}`);
});
