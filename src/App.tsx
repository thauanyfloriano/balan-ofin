import React, { useState } from 'react';
import { Upload, XCircle, Download } from 'lucide-react';
import { processFinancialFile, exportReportToExcel } from './services/finance.service';
import type { ProcessSummary } from './services/finance.service';
import { motion, AnimatePresence } from 'framer-motion';
import { generateFinancialDiagnosis } from './services/ai.service';
import ReactMarkdown from 'react-markdown';
const App: React.FC = () => {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [aiDiagnosis, setAiDiagnosis] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

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

  return (
    <div className="dashboard">
      <header>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h1>Balancete Financeiro</h1>
          <p className="subtitle" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Regra: Intersecção PIDs (EXTRATO/Planilha1 + INF)</p>
        </motion.div>
      </header>

      <AnimatePresence mode="wait">
        {!report ? (
          <motion.div key="upload" className="card">
            <label className="upload-container">
              <input type="file" onChange={onFileUpload} accept=".xlsx, .xls, .csv" style={{ display: 'none' }} />
              <Upload className="upload-icon" />
              <h2>{loading ? 'Processando...' : 'Carregar Planilha'}</h2>
            </label>
          </motion.div>
        ) : (
          <motion.div key="results" className="results-view">
            <div className="metrics-grid">
              <div className="card metric-item">
                <div className="metric-label">ENTRADAS</div>
                <div className="metric-value success">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(report.generalTotalIn)}
                </div>
              </div>
              <div className="card metric-item">
                <div className="metric-label">SAÍDAS</div>
                <div className="metric-value error">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(report.generalTotalOut)}
                </div>
              </div>
              <div className="card metric-item">
                <div className="metric-label">SALDO</div>
                <div className="metric-value primary">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(report.generalBalance)}
                </div>
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  placeholder="Pesquisar Processo..." 
                  className="search-input"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ flex: 1, padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '0.75rem', color: '#fff', minWidth: '200px' }}
                />
                <button className="btn outline" onClick={() => exportReportToExcel(report)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}>
                  <Download size={18} /> Exportar Excel
                </button>
                <button className="btn outline" onClick={() => { setReport(null); setSearchTerm(''); setAiDiagnosis(null); }}>Refazer</button>
              </div>

              <div className="card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, rgba(88,101,242,0.1) 0%, rgba(138,43,226,0.1) 100%)', border: '1px solid rgba(88,101,242,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff' }}>
                    <span style={{ fontSize: '1.2rem' }}>✨</span> Diagnóstico Inteligente Gemini
                  </h3>
                  <button 
                    className="btn" 
                    onClick={handleGenerateDiagnosis}
                    disabled={loadingAi}
                    style={{ background: 'linear-gradient(45deg, #5865F2, #8A2BE2)', border: 'none', color: '#white', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: loadingAi ? 'wait' : 'pointer' }}
                  >
                    {loadingAi ? 'Analisando...' : 'Gerar Diagnóstico (AI)'}
                  </button>
                </div>
                {aiDiagnosis && (
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.9rem', lineHeight: '1.5' }} className="markdown-body">
                    <ReactMarkdown>{aiDiagnosis}</ReactMarkdown>
                  </div>
                )}
              </div>

              {report.processes.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.6 }}>
                  <XCircle size={40} style={{ margin: '0 auto 1rem' }} />
                  <p>Nenhum ID coincidente encontrado entre Extrato e INF.</p>
                  <p style={{ fontSize: '0.8rem' }}>Verifique se os códigos (ex: CHU008) estão presentes em ambas as abas.</p>
                </div>
              ) : (
                <div className="process-table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>ID PROCESSO</th>
                        <th style={{ textAlign: 'right' }}>DELTA</th>
                        <th style={{ textAlign: 'right' }}>NACIONALIZAÇÃO</th>
                        <th style={{ textAlign: 'right' }}>DI</th>
                        <th style={{ textAlign: 'right' }}>ENTRADAS</th>
                        <th style={{ textAlign: 'right' }}>SAÍDAS</th>
                        <th style={{ textAlign: 'right' }}>SALDO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProcesses.map((p: any) => {
                        let finalDi = p.details?.diInf || 0;
                        if (p.hasJmCorretora) {
                          finalDi = 0; // A DI é ignorada pq o custo está na JM
                        }
                        return (
                          <tr key={p.process}>
                            <td style={{ fontWeight: 600 }}>{p.process}</td>
                            <td style={{ textAlign: 'right', opacity: 0.8 }}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.details?.deltaInf || 0)}</td>
                            <td style={{ textAlign: 'right', opacity: 0.8 }}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.details?.nacionalizacaoInf || 0)}</td>
                            <td style={{ textAlign: 'right', opacity: 0.8 }} title={p.hasJmCorretora ? 'Ignorado (A transferência JM no extrato já cobre este valor)' : 'Baseado na aba INF'}>
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(finalDi)}
                              {p.hasJmCorretora && <span style={{ color: 'var(--text-muted)', fontSize: '0.7em', display: 'block' }}>Valor na JM</span>}
                            </td>
                            <td style={{ textAlign: 'right' }} className="success">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.totalIn)}</td>
                            <td style={{ textAlign: 'right' }} className="error">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.totalOut)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: p.balance >= 0 ? 'var(--success)' : 'var(--error)' }}>
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.balance)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .btn.outline { background: transparent; border: 1px solid var(--primary); color: var(--primary); padding: 0.75rem 1.5rem; border-radius: 0.75rem; cursor: pointer; }
        th { border-bottom: 1px solid var(--glass-border); }
      `}</style>
    </div>
  );
};

export default App;
