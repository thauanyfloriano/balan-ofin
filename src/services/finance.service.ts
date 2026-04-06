import * as XLSX from 'xlsx';

export interface Transaction {
  description: string;
  value: number;
  type: 'IN' | 'OUT';
  source: 'EXTRATO' | 'INF' | 'PLANILHA1';
}

export interface ProcessSummary {
  process: string;
  totalIn: number;
  totalOut: number;
  balance: number;
  estimatedProfit: number;
  hasJmCorretora: boolean;
  transactions: Transaction[];
  details: {
    extratoNegativeSum: number;
    jmTransferSum: number;
    deltaInf: number;
    nacionalizacaoInf: number;
    diInf: number;
    jmCorretoraAdjusted: boolean;
  };
}

export interface NFSummary {
  nfNumber: string;
  clientName: string;
  emittedValue: number;
  receivedValue: number;
  diff: number;
  processId?: string;
}

export async function processFinancialFile(file: File): Promise<{
  processes: ProcessSummary[];
  nfSummaries: NFSummary[];
  generalTotalIn: number;
  generalTotalOut: number;
  generalBalance: number;
}> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  
  const sheetData: Record<string, any[][]> = {};
  workbook.SheetNames.forEach(name => {
    sheetData[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 });
  });

  const extratoSheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('extrato')) || workbook.SheetNames[0];
  const infSheetName = workbook.SheetNames.find(n => {
    const lower = n.toLowerCase();
    return lower.includes('inf');
  });
  const nfSheetName = workbook.SheetNames.find(n => {
    const lower = n.toLowerCase();
    return lower === 'nf' || lower.includes(' aba nf') || lower.includes('nota');
  });
  const planilha1SheetName = workbook.SheetNames.find(n => {
    const lower = n.toLowerCase().replace(/\s/g, '');
    return lower === 'planilha1' || lower.includes('fixa');
  });

  const extratoRows = sheetData[extratoSheetName] || [];
  const infRows = infSheetName ? sheetData[infSheetName] : [];
  const nfRows = nfSheetName ? sheetData[nfSheetName] : [];
  const planilha1Rows = planilha1SheetName ? sheetData[planilha1SheetName] : [];

  const cleanValue = (val: any): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const str = val.trim();
      const sanitized = str.replace(/R\$\s?/, '').replace(/\./g, '').replace(',', '.').trim();
      let num = parseFloat(sanitized);
      if (!isNaN(num)) {
        if (str.toUpperCase().endsWith('D') || str.toUpperCase().endsWith(' D') || str.startsWith('-')) {
          num = -Math.abs(num);
        } else if (str.toUpperCase().endsWith('C') || str.toUpperCase().endsWith(' C')) {
          num = Math.abs(num);
        }
      }
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  const normalizePid = (pid: string): string => pid.replace(/[^a-z0-9]/gi, '').toUpperCase();

  const findPidInRow = (row: any[]): string | null => {
    if (!row || !Array.isArray(row)) return null;

    const isDateAbbr = (str: string) => {
        const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
        return months.some(m => str.toUpperCase().startsWith(m));
    };

    // 1 prioritário: se está explicitamente entre parênteses
    for (const cell of row) {
      if (!cell) continue;
      const val = String(cell);
      const matchParens = val.match(/\(([^)]+)\)/);
      if (matchParens) {
        const norm = normalizePid(matchParens[1]);
        if (norm && !isDateAbbr(norm)) return norm;
      }
    }

    // 2 prioritário: buscar por regex nos índices mais comuns Col C(2), Col B(1), Col A(0)
    const scanIndices = [2, 1, 0, 3, 4, 5, 6, 7];
    for (const idx of scanIndices) {
      if (idx >= row.length) continue;
      const val = String(row[idx] || '');
      const matchCode = val.match(/\b[A-Z]{2,}[-A-Z0-9]*\d[-A-Z0-9]*\b/i);
      if (matchCode) {
        let norm = normalizePid(matchCode[0]);
        if (!isDateAbbr(norm) && norm.length >= 4) return norm;
      }
    }
    
    return null;
  };

  const extratoPids = new Set<string>();
  extratoRows.forEach(r => { const p = findPidInRow(r); if (p) extratoPids.add(p); });
  planilha1Rows.forEach(r => { const p = findPidInRow(r); if (p) extratoPids.add(p); }); // Considera PIDs da Planilha1 úteis para a interseção
  
  const infPids = new Set<string>();
  infRows.forEach(r => { const p = findPidInRow(r); if (p) infPids.add(p); });
  const intersectionPids = new Set([...extratoPids].filter(p => infPids.has(p)));

  const processMap: Record<string, ProcessSummary> = {};

  const getOrCreateProcess = (pid: string) => {
    if (!processMap[pid]) {
      processMap[pid] = {
        process: pid, totalIn: 0, totalOut: 0, balance: 0, estimatedProfit: 0, hasJmCorretora: false,
        transactions: [],
        details: { extratoNegativeSum: 0, jmTransferSum: 0, deltaInf: 0, nacionalizacaoInf: 0, diInf: 0, jmCorretoraAdjusted: false }
      };
    }
    return processMap[pid];
  };

  // Identificar colunas na planilha INF iterando os cabeçalhos
  let deltaCol = -1, nacCol = -1, diCol = -1;
  for (let i = 0; i < Math.min(10, infRows.length); i++) {
     const row = infRows[i];
     if (!Array.isArray(row)) continue;
     row.forEach((cell, index) => {
        if (typeof cell === 'string') {
           const c = cell.toLowerCase().trim();
           if (c.includes('delta')) deltaCol = index;
           if (c.includes('nacionali') || c.includes('nac.')) nacCol = index;
           if (/\bdi\b/.test(c) || c === 'd.i' || c === 'd.i.') diCol = index;
        }
     });
     if (deltaCol !== -1 && nacCol !== -1 && diCol !== -1) break;
  }
  
  // Fallback para Delta se não achar cabeçalho (pois sabemos que historicamente é Col B)
  if (deltaCol === -1) deltaCol = 1;

  // Process INF
  infRows.forEach(row => {
    const pid = findPidInRow(row);
    if (!pid || !intersectionPids.has(pid)) return;
    const p = getOrCreateProcess(pid);
    
    // Processa DELTA
    if (deltaCol !== -1) {
      const v = Math.abs(cleanValue(row[deltaCol]));
      if (v > 0 && p.details.deltaInf === 0) {
        p.details.deltaInf = v;
        p.transactions.push({ description: 'DELTA (INF)', value: v, type: 'OUT', source: 'INF' });
      }
    }
    
    // Processa NACIONALIZAÇÃO
    if (nacCol !== -1) {
      const v = Math.abs(cleanValue(row[nacCol]));
      if (v > 0 && p.details.nacionalizacaoInf === 0) {
        p.details.nacionalizacaoInf = v;
        p.transactions.push({ description: 'NACIONALIZAÇÃO (INF)', value: v, type: 'OUT', source: 'INF' });
      }
    }
    
    // Processa DI
    if (diCol !== -1) {
      const v = Math.abs(cleanValue(row[diCol]));
      if (v > 0 && p.details.diInf === 0) {
        p.details.diInf = v;
        p.transactions.push({ description: 'DI (INF)', value: v, type: 'OUT', source: 'INF' });
      }
    }

  });

  // Função auxiliar para processar linhas com padrão Col D = Entrada, Col E = Saída
  const processRowLogic = (row: any[], sourceName: 'EXTRATO' | 'PLANILHA1') => {
    const pid = findPidInRow(row);
    if (!pid || !intersectionPids.has(pid)) return;
    const p = getOrCreateProcess(pid);
    
    // Coluna D (index 3) = ENTRADAS
    const valIn = Math.abs(cleanValue(row[3]));
    // Coluna E (index 4) = SAÍDAS
    const valOut = Math.abs(cleanValue(row[4]));

    
    // Identificação de descrição para regras (Nacionalização, JM Corretora, etc)
    const descFull = row.filter(c => c && typeof c === 'string').join(' ');
    const colC = String(row[2] || '').toLowerCase();
    const desc = descFull.toLowerCase();
    const shortDesc = String(row[2] || row[1] || (valIn > 0 ? 'Entrada' : 'Saída'));

    // Regra: Se a coluna C contém "delta", não entra na soma (geralmente processado via INF)
    if (colC.includes('delta')) {
      p.transactions.push({ description: `${shortDesc} (Ignorado Delta)`, value: Math.max(valIn, valOut), type: valIn > 0 ? 'IN' : 'OUT', source: sourceName });
      return;
    }

    if (desc.includes('jm corretora')) p.hasJmCorretora = true;

    if (valIn > 0) {
      p.totalIn += valIn;
      p.transactions.push({ description: shortDesc, value: valIn, type: 'IN', source: sourceName });
    }

    if (valOut > 0) {
      if (!desc.includes('nacionaliza') && !desc.includes('nacionalisa')) {
        if (desc.includes('jm corretora')) {
          p.details.jmTransferSum += valOut;
        }
        p.details.extratoNegativeSum += valOut;
        p.transactions.push({ description: shortDesc, value: valOut, type: 'OUT', source: sourceName });
      } else {
         p.transactions.push({ description: `${shortDesc} (Ignorado ${sourceName})`, value: valOut, type: 'OUT', source: sourceName });
      }
    }
  };

  // Process EXTRATO
  extratoRows.forEach(row => processRowLogic(row, 'EXTRATO'));

  // Process Planilha1 / Fixa
  planilha1Rows.forEach(row => processRowLogic(row, 'PLANILHA1'));

  const processesList = Object.values(processMap).map(p => {
    let finalDi = p.details.diInf;
    if (p.hasJmCorretora) {
       finalDi = 0; // Ignora DI porque a transferência JM assume este custo
       p.details.jmCorretoraAdjusted = true;
       p.transactions.push({ description: 'DI (INF) - IGNORADA (Substituída pelo valor transferido à JM)', value: 0, type: 'OUT', source: 'INF' });
    }
    p.totalOut = p.details.extratoNegativeSum + p.details.deltaInf + p.details.nacionalizacaoInf + finalDi;
    p.balance = p.totalIn - p.totalOut;
    p.estimatedProfit = p.balance; // Will be updated later
    return p;
  });

  // ========== LÓGICA DE NOTAS FISCAIS (ABA NF) ==========
  const nfMap: Record<string, NFSummary> = {};
  
  nfRows.forEach(row => {
    if (!Array.isArray(row)) return;
    const nfNumber = String(row[0] || '').trim();
    const emittedValue = Math.abs(cleanValue(row[4]));
    
    // A coluna F (índice 5) contém a identificação do processo na aba NF
    const colFPid = String(row[5] || '').trim();
    let pidMatch = colFPid ? normalizePid(colFPid) : findPidInRow(row);

    const clientName = String(row[2] || '').trim();
    
    // Validar se realmente é uma linha de Nota (nfNumber deve ser numérico ou conter algo válido)
    if (nfNumber && !isNaN(Number(nfNumber)) && emittedValue > 0) {
      if (!nfMap[nfNumber]) {
        nfMap[nfNumber] = { nfNumber, clientName, emittedValue, receivedValue: 0, diff: 0, processId: pidMatch || undefined };
      } else {
        nfMap[nfNumber].emittedValue += emittedValue;
      }
    }
  });

  // Cruzar com o Extrato para achar os recebimentos do PIX
  extratoRows.forEach(row => {
    if (!Array.isArray(row)) return;
    const valIn = Math.abs(cleanValue(row[3]));
    if (valIn === 0) return; // Só queremos Entradas (recebimentos)
    
    const descFull = row.filter(c => c && typeof c === 'string').join(' ').toLowerCase();
    
    // Preparar texto seguro sem datas e valores (R$) para não confundir com números de notas
    const safeDesc = descFull.replace(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g, '')
                             .replace(/r\$\s*\d+([.,]\d+)?/gi, '');

    const matchedNFs: string[] = [];

    // Melhoria na busca das notas
    for (const nfNumber of Object.keys(nfMap)) {
      const cleanNum = Number(nfNumber).toString();
      
      const explicitRegex = new RegExp(`(?:nf|n\\.f\\.|nota(?:\\s*fiscal)?|nt|doc)\\s*[-/]?\\s*0*${cleanNum}\\b`, 'i');
      const numberRegex = new RegExp(`\\b0*${cleanNum}\\b`);
      
      const hasKeywords = /(?:nf|n\.f\.|nota|pagto|pagamento|receb|recebimento|pix|liq)/i.test(safeDesc);
      
      if (explicitRegex.test(safeDesc) || safeDesc.includes(`nf${nfNumber}`) || safeDesc.includes(`nf ${nfNumber}`)) {
         matchedNFs.push(nfNumber);
      } else if (hasKeywords && numberRegex.test(safeDesc)) {
         matchedNFs.push(nfNumber);
      } else if (numberRegex.test(safeDesc) && Math.abs(valIn - nfMap[nfNumber].emittedValue) < 0.01) {
         matchedNFs.push(nfNumber);
      }
    }

    if (matchedNFs.length > 0) {
      const totalEmitted = matchedNFs.reduce((sum, num) => sum + nfMap[num].emittedValue, 0);
      
      matchedNFs.forEach(nfNumber => {
        const nf = nfMap[nfNumber];
        
        // Distribui o valor recebido caso haja múltiplas notas nesta mesma linha
        let allocation = 0;
        if (matchedNFs.length === 1) {
           allocation = valIn;
        } else {
           if (Math.abs(totalEmitted - valIn) < 0.1) {
             allocation = nf.emittedValue;
           } else {
             // Distribuição proporcional ao valor emitido
             allocation = (totalEmitted > 0) ? (nf.emittedValue / totalEmitted) * valIn : 0;
           }
        }
        
        nf.receivedValue += allocation;
        
        const pidMatch = findPidInRow(row);
        if (pidMatch && !nf.processId) {
          nf.processId = pidMatch;
        }
      });
    }
  });

  const nfSummaries = Object.values(nfMap).map(nf => {
    nf.diff = nf.emittedValue - nf.receivedValue;
    return nf;
  });

  // Update Estimated Profit
  processesList.forEach(p => {
    // Pegamos as notas associadas a este processo
    const processNFs = nfSummaries.filter(nf => nf.processId === p.process);
    const totalEmitted = processNFs.reduce((sum, nf) => sum + nf.emittedValue, 0);
    
    // Regra explicada:
    // Se o processo JÁ teve entradas reais no extrato (> 0), o lucro estimado 
    // é exatamente o que está no saldo final da operação naquele momento.
    // Se a entrada ainda está ZERADA, usamos os valores emitidos na aba NF 
    // como estimativa do que vai entrar, e deduzimos do que já gastou (Saídas) 
    // para enxergar o lucro esperado.
    if (p.totalIn === 0) {
       p.estimatedProfit = p.balance + totalEmitted;
    } else {
       p.estimatedProfit = p.balance;
    }
  });
  // =======================================================

  return {
    processes: processesList,
    nfSummaries,
    generalTotalIn: processesList.reduce((s, p) => s + p.totalIn, 0),
    generalTotalOut: processesList.reduce((s, p) => s + p.totalOut, 0),
    generalBalance: processesList.reduce((s, p) => s + p.balance, 0)
  };
}

export function exportReportToExcel(report: any) {
  const wsData = report.processes.map((p: ProcessSummary) => {
    let finalDi = p.details?.diInf || 0;
    if (p.hasJmCorretora) finalDi = 0;
    
    const row: any = {
      'PROCESSO': p.process,
      'DELTA (R$)': p.details?.deltaInf || 0,
      'NACIONALIZAÇÃO (R$)': p.details?.nacionalizacaoInf || 0,
      'DI (R$)': finalDi,
      'ENTRADAS (R$)': p.totalIn,
      'SAÍDAS (R$)': p.totalOut,
      'SALDO (R$)': p.balance
    };

    if (report.showEstimativa) {
       row['LUCRO ESTIMADO (R$)'] = p.estimatedProfit || 0;
    }

    return row;
  });

  const ws = XLSX.utils.json_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Balancete");

  // Adiciona a aba 'Valores Pendentes' com todas as notas presentes na tela
  if (report.nfSummaries && report.nfSummaries.length > 0) {
    const wsPendenciasData = report.nfSummaries.map((nf: any) => {
      let situacao = 'Quitado';
      if (nf.diff > 0.01) situacao = 'A receber';
      else if (nf.diff < -0.01) situacao = 'Recebido a mais';

      return {
        'Nº NOTA': nf.nfNumber,
        'PROCESSO': nf.processId || '-',
        'CLIENTE': nf.clientName,
        'NOTA EMITIDA (R$)': nf.emittedValue,
        'RECEBIDO (R$)': nf.receivedValue,
        'DIFERENÇA (R$)': Math.abs(nf.diff) > 0.01 ? nf.diff : 0,
        'SITUAÇÃO': situacao
      };
    });
    
    const wsPendencias = XLSX.utils.json_to_sheet(wsPendenciasData);
    XLSX.utils.book_append_sheet(wb, wsPendencias, "Valores Pendentes");
  }

  XLSX.writeFile(wb, "Balancete_Financeiro.xlsx");
}

