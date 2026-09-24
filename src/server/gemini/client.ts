import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;

export function getGenAI(): GoogleGenerativeAI {
	if (!genAI) {
		genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
	}
	return genAI;
}

export function getModel(modelName: string = "gemini-2.5-flash") {
	return getGenAI().getGenerativeModel({ model: modelName });
}
