import React, { useState } from 'react';
import { processFinancialFile, exportReportToExcel } from './services/finance.service';
import type { ProcessSummary } from './services/finance.service';
import { generateFinancialDiagnosis } from './services/ai.service';
import ReactMarkdown from 'react-markdown';

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
};

const App: React.FC = () => {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showReceberDiff, setShowReceberDiff] = useState(false);
  const [showEstimativa, setShowEstimativa] = useState(false);
  const [aiDiagnosis, setAiDiagnosis] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [expandedProcess, setExpandedProcess] = useState<string | null>(null);

  const handleGenerateDiagnosis = async () => {
    if (!report) return;
    setLoadingAi(true);
    try {
      const diagnosis = await generateFinancialDiagnosis(
        report.processes,
        { in: report.generalTotalIn, out: report.generalTotalOut, balance: report.generalBalance }
      );
      setAiDiagnosis(diagnosis);
    } catch (error) {
      console.error(error);
      setAiDiagnosis('Erro ao conectar com a IA. Tente novamente mais tarde.');
    } finally {
      setLoadingAi(false);
    }
  };

  const onFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);
    try {
      const result = await processFinancialFile(file);
      setReport(result);
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      alert('Erro ao processar o arquivo Excel. Verifique o formato.');
    } finally {
      setLoading(false);
    }
  };

  const filteredProcesses = report?.processes.filter((p: ProcessSummary) => 
    p.process.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredNFs = report?.nfSummaries ? report.nfSummaries.filter((nf: any) => {
    const search = searchTerm.toLowerCase();
    return (nf.processId?.toLowerCase() || '').includes(search) ||
           (nf.clientName?.toLowerCase() || '').includes(search) ||
           (String(nf.nfNumber).toLowerCase()).includes(search);
  }) : [];

  return (
    <div className="flex h-screen w-full">
      {/* SideNavBar */}
      <aside className="fixed left-0 top-0 h-full z-50 flex flex-col bg-[#0c0e14]/80 backdrop-blur-xl font-['Manrope'] antialiased w-20 md:w-64 border-r border-white/5 shadow-2xl shadow-black/50">
        <div className="px-6 py-8 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-dim flex items-center justify-center text-white shrink-0">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance_wallet</span>
          </div>
          <div className="hidden md:block overflow-hidden">
            <h1 className="text-lg font-bold tracking-tight text-[#ba9eff] whitespace-nowrap">Balance Sheet</h1>
          </div>
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <a className="flex items-center gap-4 px-4 py-3 text-[#ba9eff] border-r-2 border-[#ba9eff] font-semibold bg-white/5 transition-all duration-300" href="#">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>insights</span>
            <span className="hidden md:block text-sm">Analytics</span>
          </a>
        </nav>
      </aside>

      {/* Main Canvas */}
      <main className="flex-1 ml-20 md:ml-64 flex flex-col h-screen overflow-hidden">
        {/* TopAppBar */}
        <header className="flex justify-between items-center w-full px-8 py-4 sticky top-0 z-40 bg-[#0c0e14]/50 backdrop-blur-md font-['Manrope'] text-sm font-medium tracking-wide">
          <div className="flex items-center gap-8">
            <div className="hidden lg:flex items-center gap-6">
              {fileName ? (
                <span className="text-slate-400 hover:text-[#ba9eff] cursor-pointer transition-colors">
                  Arquivo: {fileName}
                </span>
              ) : (
                <span className="text-slate-600">Nenhum arquivo enviado</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
              <input 
                className="bg-surface-container-lowest border-none text-xs rounded-lg pl-10 pr-4 py-2 w-64 focus:ring-1 focus:ring-primary/30 transition-all text-on-surface" 
                placeholder="Pesquisar processos..." 
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {report && (
              <button 
                onClick={() => { setReport(null); setSearchTerm(''); setAiDiagnosis(null); setShowReceberDiff(false); setShowEstimativa(false); setFileName(null); setExpandedProcess(null); }}
                className="bg-surface-container-low text-white border border-white/10 px-4 py-2 rounded-md text-xs font-bold hover:bg-white/5 transition-all"
              >
                Limpar
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 hide-scrollbar">
          
          {/* Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-secondary/5 blur-3xl -mr-12 -mt-12 group-hover:bg-secondary/10 transition-all"></div>
              <p className="text-xs font-bold tracking-widest text-secondary-fixed-dim uppercase mb-4">ENTRADAS</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black font-headline text-white">
                  {report ? formatCurrency(report.generalTotalIn) : 'R$ 0,00'}
                </span>
              </div>
            </div>
            <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-tertiary/5 blur-3xl -mr-12 -mt-12 group-hover:bg-tertiary/10 transition-all"></div>
              <p className="text-xs font-bold tracking-widest text-tertiary-dim uppercase mb-4">SAÍDAS</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black font-headline text-white">
                  {report ? formatCurrency(report.generalTotalOut) : 'R$ 0,00'}
                </span>
              </div>
            </div>
            <div className="glass-panel p-6 rounded-2xl border-primary/20 bg-primary/5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl -mr-16 -mt-16 group-hover:bg-primary/20 transition-all"></div>
              <p className="text-xs font-bold tracking-widest text-primary uppercase mb-4">SALDO LÍQUIDO</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black font-headline text-white">
                  {report ? formatCurrency(report.generalBalance) : 'R$ 0,00'}
                </span>
              </div>
            </div>
          </div>

          {!report ? (
            <div className="flex flex-col items-center justify-center p-12 mt-12 border-2 border-dashed border-white/20 rounded-3xl bg-white/5">
                <label className="cursor-pointer flex flex-col items-center justify-center text-center">
                  <input type="file" onChange={onFileUpload} accept=".xlsx, .xls, .csv" style={{ display: 'none' }} />
                  <span className="material-symbols-outlined text-6xl text-primary mb-4" style={{ fontVariationSettings: "'FILL' 1" }}>upload_file</span>
                  <h3 className="font-headline text-2xl font-bold text-white mb-2">Subir Planilha Financeira</h3>
                  <p className="text-slate-400 text-sm max-w-md">Envie seu arquivo de Extrato ou INF nos formatos compatíveis (.xlsx, .xls, .csv) para iniciar a análise e extração dos processos.</p>
                  
                  {loading && (
                    <div className="mt-8 flex items-center gap-3 text-secondary-fixed-dim">
                      <span className="material-symbols-outlined animate-spin">refresh</span>
                      <span className="font-bold">Processando informações...</span>
                    </div>
                  )}
                  
                  {!loading && (
                    <div className="mt-8 bg-primary text-black px-6 py-3 rounded-xl font-bold hover:bg-primary-hover transition-colors">
                      Selecionar Arquivo
                    </div>
                  )}
                </label>
            </div>
          ) : (
            <>
              {/* AI Diagnostic Section */}
              <section className="rounded-2xl p-8 bg-gradient-to-br from-primary-dim/20 to-[#370086]/20 border border-primary/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-20">
                  <span className="material-symbols-outlined text-8xl" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                </div>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shrink-0">
                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                  </div>
                  <div>
                    <h3 className="font-headline text-lg font-bold">AI Financial Diagnostic</h3>
                    <p className="text-xs text-on-surface-variant">Insights gerados por Gemini Engine v4.0</p>
                  </div>
                </div>

                {!aiDiagnosis ? (
                   <button 
                     onClick={handleGenerateDiagnosis}
                     disabled={loadingAi}
                     className="bg-primary/20 text-primary border border-primary/30 px-6 py-3 rounded-xl font-bold hover:bg-primary/30 transition-colors flex items-center gap-2"
                   >
                     {loadingAi ? (
                       <>
                         <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                         Analisando Dados...
                       </>
                     ) : (
                       <>
                         <span className="material-symbols-outlined text-sm">psychiatry</span>
                         Iniciar Diagnóstico
                       </>
                     )}
                   </button>
                ) : (
                  <div className="prose prose-invert max-w-none text-sm text-on-surface/80 space-y-4">
                    <ReactMarkdown>{aiDiagnosis}</ReactMarkdown>
                  </div>
                )}
              </section>

              {/* Valor a Receber / Divergências de Notas (Condicional) */}
              {showReceberDiff && report && (
                <div className="space-y-4">
                  <div className="glass-panel rounded-2xl overflow-hidden p-6 border-secondary/20">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                       <h3 className="font-headline text-xl font-extrabold tracking-tight">Valores Pendentes (Diferença NF vs Extrato)</h3>
                       {report.nfSummaries && (
                          <div className="flex gap-4">
                             <div className="bg-surface-container-low px-4 py-2 rounded-lg border border-white/5 flex gap-2 items-center">
                               <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">Total Recebido</span>
                               <span className="text-secondary font-bold text-sm">
                                 {formatCurrency(report.nfSummaries.reduce((sum: number, nf: any) => sum + nf.receivedValue, 0))}
                               </span>
                             </div>
                             <div className="bg-surface-container-low px-4 py-2 rounded-lg border border-white/5 flex gap-2 items-center">
                               <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">A Receber</span>
                               <span className="text-tertiary-dim font-bold text-sm">
                                 {formatCurrency(report.nfSummaries.reduce((sum: number, nf: any) => sum + (nf.diff > 0 ? nf.diff : 0), 0))}
                               </span>
                             </div>
                          </div>
                       )}
                    </div>

                    {report.nfSummaries && (() => {
                      if (filteredNFs.length === 0) {
                        return <p className="text-sm text-on-surface-variant italic">Nenhuma nota fiscal encontrada para esta pesquisa ou nenhum registro disponível.</p>;
                      }

                      return (
                       <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-surface-container-low/50">
                              <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Nº Nota</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Processo</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Cliente</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">Nota Emitida</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">Recebido (Extrato)</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">Situação / Diferença</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {filteredNFs.map((nf: any) => (
                              <tr key={'nf_' + nf.nfNumber} className="hover:bg-white/[0.02] transition-colors">
                                <td className="px-6 py-4 font-mono text-xs text-primary font-bold">{nf.nfNumber}</td>
                                <td className="px-6 py-4 text-xs">{nf.processId || '-'}</td>
                                <td className="px-6 py-4 text-xs">{nf.clientName}</td>
                                <td className="px-6 py-4 text-xs text-right opacity-80">{formatCurrency(nf.emittedValue)}</td>
                                <td className="px-6 py-4 text-xs text-right text-secondary-fixed font-bold">{formatCurrency(nf.receivedValue)}</td>
                                <td className={`px-6 py-4 text-xs text-right font-bold ${Math.abs(nf.diff) <= 0.01 ? 'text-slate-400' : nf.diff > 0 ? 'text-tertiary-dim' : 'text-secondary-fixed'}`}>
                                  {Math.abs(nf.diff) > 0.01 ? formatCurrency(Math.abs(nf.diff)) : 'R$ 0,00'}
                                  <span className="text-[10px] block opacity-75 font-normal">
                                    {Math.abs(nf.diff) <= 0.01 ? 'Quitado' : nf.diff > 0 ? 'a receber' : 'recebido a mais'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                       </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Data Table Section */}
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <h3 className="font-headline text-xl font-extrabold tracking-tight">Processos Financeiros</h3>
                  <div className="flex flex-wrap items-center gap-3">
                    <button 
                      onClick={() => exportReportToExcel({ processes: filteredProcesses, nfSummaries: filteredNFs, showEstimativa })}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-xs font-bold transition-all border border-white/5"
                    >
                      <span className="material-symbols-outlined text-sm">download</span>
                      Exportar Excel
                    </button>
                    <button 
                      onClick={() => setShowReceberDiff(!showReceberDiff)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all border ${showReceberDiff ? 'bg-secondary/20 text-secondary border-secondary/40' : 'bg-surface-container-high text-slate-300 border-white/5 hover:bg-surface-bright'}`}
                    >
                      <span className="material-symbols-outlined text-sm">payments</span>
                      Valor a Receber
                    </button>
                    <button 
                      onClick={() => setShowEstimativa(!showEstimativa)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all border ${showEstimativa ? 'bg-primary/20 text-primary border-primary/40' : 'bg-surface-container-high text-slate-300 border-white/5 hover:bg-surface-bright'}`}
                    >
                      <span className="material-symbols-outlined text-sm">finance</span>
                      Estimativa de Lucro
                    </button>
                  </div>
                </div>

                <div className="glass-panel rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-surface-container-low/50">
                          <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">ID PROCESSO</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">ENTRADAS</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">SAÍDAS</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">SALDO</th>
                          {showEstimativa && (
                             <th className="px-6 py-4 text-[10px] font-bold text-primary uppercase tracking-widest text-right">LUCRO ESTIMADO</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredProcesses.map((p: any) => {
                          let finalDi = p.details?.diInf || 0;
                          let diDesc = finalDi > 0 ? "DI em aberto" : "";
                          if (p.hasJmCorretora) {
                            finalDi = p.details?.jmTransferSum || 0;
                            diDesc = "Valor na JM";
                          }
                          const isExpanded = expandedProcess === p.process;
                          return (
                            <React.Fragment key={p.process}>
                              <tr 
                                onClick={() => setExpandedProcess(isExpanded ? null : p.process)} 
                                className={`transition-colors group cursor-pointer ${isExpanded ? 'bg-primary/5' : 'hover:bg-white/[0.02]'}`}
                              >
                                <td className="px-6 py-4 font-mono text-xs text-primary font-bold flex items-center gap-2">
                                  <span className={`material-symbols-outlined text-sm transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                                  {p.process}
                                </td>
                                <td className="px-6 py-4 text-xs font-bold text-right text-secondary-fixed">{formatCurrency(p.totalIn)}</td>
                                <td className="px-6 py-4 text-xs font-bold text-right text-tertiary-dim">{formatCurrency(p.totalOut)}</td>
                                <td className="px-6 py-4 text-right">
                                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${p.balance >= 0 ? 'bg-secondary/10 text-secondary' : 'bg-tertiary/10 text-tertiary'}`}>
                                    {p.balance > 0 ? '+' : ''}{formatCurrency(p.balance)}
                                  </span>
                                </td>
                                {showEstimativa && (
                                  <td className="px-6 py-4 text-right">
                                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap bg-primary/10 text-primary border border-primary/20`}>
                                      {p.estimatedProfit > 0 ? '+' : ''}{formatCurrency(p.estimatedProfit)}
                                    </span>
                                  </td>
                                )}
                              </tr>
                              {isExpanded && (
                                <tr className="bg-[#0c0e14]/50 border-b border-primary/20">
                                  <td colSpan={showEstimativa ? 5 : 4} className="px-8 py-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                      {/* CUSTOS INF */}
                                      <div>
                                        <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-sm">receipt_long</span> Valores Ocultos (INF)</h4>
                                        <div className="space-y-2 bg-[#0c0e14] p-4 rounded-xl border border-white/5">
                                          <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-400">DELTA:</span>
                                            <span className="font-medium text-slate-300">{formatCurrency(p.details?.deltaInf || 0)}</span>
                                          </div>
                                          <div className="flex justify-between items-center text-xs border-t border-white/5 pt-2">
                                            <span className="text-slate-400">NACIONALIZAÇÃO:</span>
                                            <span className="font-medium text-slate-300">{formatCurrency(p.details?.nacionalizacaoInf || 0)}</span>
                                          </div>
                                          <div className="flex justify-between items-center text-xs border-t border-white/5 pt-2">
                                            <span className="text-slate-400">DI:</span>
                                            <div className="text-right">
                                              <span className="font-medium text-slate-300">{formatCurrency(finalDi)}</span>
                                              {diDesc && <span className="block text-[9px] text-primary/80 mt-0.5">{diDesc}</span>}
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Mapeamento de Transações */}
                                      <div>
                                        <h4 className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-sm">list_alt</span> Movimentações Consideradas</h4>
                                        <div className="space-y-4">
                                          <div>
                                            <h5 className="text-[9px] text-secondary-fixed/70 uppercase tracking-widest mb-2 font-bold pl-2 border-l-2 border-secondary/30">Entradas Identificadas</h5>
                                            <ul className="space-y-1">
                                              {p.transactions.filter((t: any) => t.type === 'IN' && !t.description.toLowerCase().includes('ignora')).map((t: any, idx: number) => (
                                                <li key={`in-${idx}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs bg-white/[0.02] hover:bg-white/[0.05] p-2 rounded-md transition-colors gap-1">
                                                  <span className="text-slate-400 truncate max-w-[200px] sm:max-w-[250px]" title={t.description}>
                                                    <span className="text-[8px] bg-secondary/10 text-secondary px-1 py-0.5 rounded border border-secondary/20 mr-2 uppercase">{t.source}</span>
                                                    {t.description}
                                                  </span>
                                                  <span className="text-secondary-fixed font-mono font-bold sm:text-right">{formatCurrency(t.value)}</span>
                                                </li>
                                              ))}
                                              {p.transactions.filter((t: any) => t.type === 'IN' && !t.description.toLowerCase().includes('ignora')).length === 0 && (
                                                <li className="text-xs text-slate-500 italic p-2">Nenhuma entrada contabilizada.</li>
                                              )}
                                            </ul>
                                          </div>
                                          <div>
                                            <h5 className="text-[9px] text-tertiary/70 uppercase tracking-widest mb-2 font-bold pl-2 border-l-2 border-tertiary/30">Saídas / Descontos Identificados</h5>
                                            <ul className="space-y-1">
                                              {p.transactions.filter((t: any) => t.type === 'OUT' && !t.description.toLowerCase().includes('ignora')).map((t: any, idx: number) => (
                                                <li key={`out-${idx}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs bg-white/[0.02] hover:bg-white/[0.05] p-2 rounded-md transition-colors gap-1">
                                                  <span className="text-slate-400 truncate max-w-[200px] sm:max-w-[250px]" title={t.description}>
                                                    <span className="text-[8px] bg-tertiary/10 text-tertiary px-1 py-0.5 rounded border border-tertiary/20 mr-2 uppercase">{t.source}</span>
                                                    {t.description}
                                                  </span>
                                                  <span className="text-tertiary-dim font-mono font-bold sm:text-right">{formatCurrency(t.value)}</span>
                                                </li>
                                              ))}
                                              {p.transactions.filter((t: any) => t.type === 'OUT' && !t.description.toLowerCase().includes('ignora')).length === 0 && (
                                                <li className="text-xs text-slate-500 italic p-2">Nenhuma saída contabilizada.</li>
                                              )}
                                            </ul>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                        {filteredProcesses.length === 0 && (
                          <tr>
                            <td colSpan={showEstimativa ? 5 : 4} className="px-6 py-12 text-center text-sm text-slate-500">
                              Nenhum processo encontrado ou equivalente à pesquisa.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {filteredProcesses.length > 0 && (
                    <div className="p-6 border-t border-white/5 flex items-center justify-between">
                      <p className="text-xs text-on-surface-variant">Mostrando {filteredProcesses.length} processos</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  );
};

export default App;

