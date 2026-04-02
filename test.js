import { GoogleGenAI } from "@google/genai";


const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });

async function run() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Hi",
    });
    console.log(response.text);
  } catch (error) {
    console.error("Error payload:");
    console.error(error);
  }
}

run();
