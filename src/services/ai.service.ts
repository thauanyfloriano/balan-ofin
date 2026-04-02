import { GoogleGenAI } from "@google/genai";
import type { ProcessSummary } from "./finance.service";

let ai: GoogleGenAI | null = null;
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

export async function generateFinancialDiagnosis(
  processes: ProcessSummary[],
  totals: { in: number; out: number; balance: number }
): Promise<string> {
  if (!ai) {
    return "API Key do Gemini não configurada no arquivo .env (VITE_GEMINI_API_KEY).";
  }

  const prompt = `
Você é um consultor financeiro sênior especializado em comércio exterior.
Aqui está o resumo financeiro dos processos de importação recém-processados:

Entradas Totais: R$ ${totals.in.toFixed(2)}
Saídas Totais: R$ ${totals.out.toFixed(2)}
Saldo Total: R$ ${totals.balance.toFixed(2)}

Total de Processos: ${processes.length}
Processos com prejuízo: ${processes.filter(p => p.balance < 0).length}

Visão geral dos processos com maior impacto financeiro (Top 5):
${processes
    .sort((a, b) => (b.totalIn + b.totalOut) - (a.totalIn + a.totalOut))
    .slice(0, 5)
    .map(p => `- ${p.process}: Entradas R$ ${p.totalIn.toFixed(2)}, Saídas R$ ${p.totalOut.toFixed(2)}, Saldo R$ ${p.balance.toFixed(2)}${p.hasJmCorretora ? ' (Tem transferência JM)' : ''}`)
    .join('\n')}

Com base nesses dados, forneça um diagnóstico financeiro inteligente em formato markdown. 
Analise a saúde financeira geral, comente sobre a proporção de processos com prejuízo em relação ao total, 
e dê recomendações estratégicas sobre os custos (Nacionalização, DI, etc). Explique como os dados convergem para os resultados de caixa. Escreva entre 3 e 4 parágrafos e seja direto.
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "Sem insights gerados.";
  } catch (error: any) {
    console.error("Erro ao gerar diagnóstico:", error);
    return `Ocorreu um erro ao gerar os insights processando a requisição na API da IA.\n\nDetalhes do erro: ${error?.message || JSON.stringify(error)}`;
  }
}
