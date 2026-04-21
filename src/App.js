import { useState, useEffect, useRef, useCallback } from "react";

const SKILL_ICONS = {
  1: "🏛️", 2: "🤝", 3: "🔄", 4: "🎯",
  5: "📋", 6: "💡", 7: "⚖️", 8: "📚", 9: "🌟"
};

const SKILL_COLORS = {
  1: "#3B82F6", 2: "#10B981", 3: "#F59E0B", 4: "#EF4444",
  5: "#8B5CF6", 6: "#EC4899", 7: "#14B8A6", 8: "#F97316", 9: "#6366F1"
};

const TOTAL_SECONDS = 30 * 60;

function useTimer(isRunning, onExpire) {
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const intervalRef = useRef(null);
  useEffect(() => {
    if (!isRunning) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) { clearInterval(intervalRef.current); onExpire(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [isRunning, onExpire]);
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  return { minutes, seconds, isWarning: secondsLeft <= 300, isCritical: secondsLeft <= 60 };
}

function TimerDisplay({ minutes, seconds, isWarning, isCritical }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, borderRadius:10, padding:"6px 14px", flexShrink:0,
      background: isCritical?"#FEE2E2":isWarning?"#FEF3C7":"#EFF6FF",
      border:`2px solid ${isCritical?"#EF4444":isWarning?"#F59E0B":"#BFDBFE"}` }}>
      <span>⏱️</span>
      <span style={{ fontSize:18, fontFamily:"monospace", fontWeight:isCritical?800:700,
        color:isCritical?"#DC2626":isWarning?"#D97706":"#1E40AF" }}>{minutes}:{seconds}</span>
    </div>
  );
}

function computeResults(data, answers) {
  const scores = {};
  data.skills.forEach(s => { scores[s.code] = { raw:0, appearances:0, first:0, second:0, third:0 }; });
  data.triads.forEach((triad, idx) => {
    const answer = answers[idx];
    if (!answer) return;
    triad.statements.forEach(stmt => {
      if (!stmt.skill_code) return;
      const sc = scores[stmt.skill_code];
      sc.appearances++;
      if (stmt.id === answer.first) { sc.raw += 3; sc.first++; }
      else if (stmt.id === answer.second) { sc.raw += 2; sc.second++; }
      else if (stmt.id === answer.third) { sc.raw += 1; sc.third++; }
    });
  });
  return data.skills.map(s => ({
    ...s,
    raw: scores[s.code].raw,
    appearances: scores[s.code].appearances,
    first: scores[s.code].first,
    second: scores[s.code].second,
    third: scores[s.code].third,
    maxScore: scores[s.code].appearances * 3,
    ratio: scores[s.code].appearances > 0 ? scores[s.code].raw / (scores[s.code].appearances * 3) : 0,
    percent: scores[s.code].appearances > 0 ? Math.round((scores[s.code].raw / (scores[s.code].appearances * 3)) * 100) : 0,
  })).sort((a, b) => b.ratio - a.ratio);
}

function computeConsistency(data, answers) {
  // Build lookup: stmtId -> score (3=first, 2=second, 1=third)
  const stmtScore = {};
  data.triads.forEach((triad, idx) => {
    const ans = answers[idx];
    if (!ans) return;
    triad.statements.forEach(stmt => {
      if (stmt.id === ans.first)  stmtScore[stmt.id] = 3;
      else if (stmt.id === ans.second) stmtScore[stmt.id] = 2;
      else if (stmt.id === ans.third)  stmtScore[stmt.id] = 1;
    });
  });

  // COMPONENT 1 — Trait Stability (40%)
  // For each skill, collect all scores and measure variance
  const skillScores = {};
  data.triads.forEach(triad => {
    triad.statements.forEach(stmt => {
      const sc = stmt.skill_code;
      if (!skillScores[sc]) skillScores[sc] = [];
      if (stmtScore[stmt.id] !== undefined) skillScores[sc].push(stmtScore[stmt.id]);
    });
  });
  let totalVariance = 0;
  const skillCount = Object.keys(skillScores).length;
  Object.values(skillScores).forEach(scores => {
    if (scores.length === 0) return;
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / scores.length;
    totalVariance += variance;
  });
  const traitStability = Math.max(0, 1 - (totalVariance / (skillCount * 0.9)));

  // COMPONENT 2 — Pair Consistency (40%)
  // Same-skill pairs: if a skill scores high in one triad and low in another → inconsistency
  let pairInconsistencies = 0, pairsChecked = 0;
  if (data.consistency_pairs) {
    data.consistency_pairs.forEach(pair => {
      const scoreA = stmtScore[pair.stmt_a.id];
      const scoreB = stmtScore[pair.stmt_b.id];
      if (scoreA !== undefined && scoreB !== undefined) {
        pairsChecked++;
        const diff = Math.abs(scoreA - scoreB);
        if (diff === 2) pairInconsistencies += 1.0;   // Most vs Least: serious contradiction
        else if (diff === 1) pairInconsistencies += 0.3; // mild inconsistency
      }
    });
  }
  const pairConsistency = pairsChecked > 0
    ? Math.max(0, 1 - (pairInconsistencies / pairsChecked))
    : 1;

  // COMPONENT 3 — Response Pattern / Faking Detection (20%)
  // In a 76-triad ipsative test, expected: 76 firsts, 76 seconds, 76 thirds
  const allScores = Object.values(stmtScore);
  const total = allScores.length;
  let patternScore = 1;
  if (total > 0) {
    const mostCount  = allScores.filter(v => v === 3).length;
    const midCount   = allScores.filter(v => v === 2).length;
    const leastCount = allScores.filter(v => v === 1).length;
    const expected = total / 3;
    const deviation = (
      Math.abs(mostCount  - expected) +
      Math.abs(midCount   - expected) +
      Math.abs(leastCount - expected)
    ) / (total * 2);
    patternScore = Math.max(0, 1 - deviation);
  }

  const overall = 0.40 * traitStability + 0.40 * pairConsistency + 0.20 * patternScore;
  return {
    overall:         Math.round(overall         * 100),
    traitStability:  Math.round(traitStability  * 100),
    pairConsistency: Math.round(pairConsistency * 100),
    patternScore:    Math.round(patternScore    * 100),
  };
}

function getConsistencyMeta(score) {
  if (score >= 80) return { label: "Υψηλή Συνέπεια", color: "#10B981", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.35)", badge: "✔", note: "Οι απαντήσεις παρουσιάζουν υψηλή αξιοπιστία και εσωτερική συνοχή." };
  if (score >= 60) return { label: "Μέτρια Συνέπεια", color: "#F59E0B", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.35)", badge: "⚠", note: "Ορισμένες ασυνέπειες εντοπίστηκαν. Συνιστάται προσεκτική ερμηνεία." };
  return                  { label: "Χαμηλή Συνέπεια", color: "#EF4444", bg: "rgba(239,68,68,0.10)",  border: "rgba(239,68,68,0.35)",  badge: "✖", note: "Σημαντικές αντιφάσεις εντοπίστηκαν. Τα αποτελέσματα ενδέχεται να μην είναι αξιόπιστα." };
}

function SpiderChart({ skillResults, size = 340 }) {
  const cx = size/2, cy = size/2, R = size*0.36, n = skillResults.length;
  function point(i, r) {
    const angle = (Math.PI*2*i)/n - Math.PI/2;
    return [cx + r*Math.cos(angle), cy + r*Math.sin(angle)];
  }
  const rings = [0.25, 0.5, 0.75, 1.0];
  const dataPoints = skillResults.map((s, i) => point(i, R*s.ratio));
  const dataPath = dataPoints.map((p, i) => `${i===0?"M":"L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{overflow:"visible"}}>
      {rings.map((r, ri) => {
        const pts = Array.from({length:n}, (_, i) => point(i, R*r));
        const path = pts.map((p, i) => `${i===0?"M":"L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";
        return <path key={ri} d={path} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1}/>;
      })}
      {skillResults.map((_, i) => {
        const [x,y] = point(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.15)" strokeWidth={1}/>;
      })}
      <path d={dataPath} fill="rgba(99,102,241,0.25)" stroke="#6366F1" strokeWidth={2.5} strokeLinejoin="round"/>
      {dataPoints.map(([x,y], i) => (
        <circle key={i} cx={x} cy={y} r={5} fill={SKILL_COLORS[skillResults[i].code]} stroke="#1E293B" strokeWidth={2}/>
      ))}
      {rings.map((r, ri) => {
        const [x,y] = point(0, R*r);
        return <text key={ri} x={x+4} y={y-3} fontSize={9} fill="rgba(255,255,255,0.4)">{Math.round(r*100)}%</text>;
      })}
      {skillResults.map((s, i) => {
        const [x,y] = point(i, R+30);
        const anchor = x < cx-5 ? "end" : x > cx+5 ? "start" : "middle";
        const words = s.name.split(" ");
        const lines = [];
        let cur = "";
        words.forEach(w => { if((cur+" "+w).length > 13){lines.push(cur);cur=w;}else cur=cur?cur+" "+w:w; });
        if(cur) lines.push(cur);
        return (
          <text key={i} x={x} y={y} textAnchor={anchor} fontSize={10} fontWeight={600} fill="#E2E8F0">
            {lines.map((ln, li) => <tspan key={li} x={x} dy={li===0?0:12}>{ln}</tspan>)}
            <tspan x={x} dy={13} fontSize={11} fontWeight={800} fill={SKILL_COLORS[s.code]}>{Math.round(s.ratio*100)}%</tspan>
          </text>
        );
      })}
    </svg>
  );
}

function generateReportHTML(candidateName, candidateCode, skillResults, date, consistency) {
  const svgSize = 440;
  const cx = svgSize/2, cy = svgSize/2, R = svgSize*0.33, n = skillResults.length;
  function point(i, r) {
    const angle = (Math.PI*2*i)/n - Math.PI/2;
    return [cx + r*Math.cos(angle), cy + r*Math.sin(angle)];
  }
  const rings = [0.25, 0.5, 0.75, 1.0];
  const dataPoints = skillResults.map((s, i) => point(i, R*s.ratio));
  const dataPath = dataPoints.map((p, i) => `${i===0?"M":"L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";
  function ringPath(r) {
    const pts = Array.from({length:n}, (_, i) => point(i, R*r));
    return pts.map((p, i) => `${i===0?"M":"L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";
  }
  const colArr = Object.values(SKILL_COLORS);

  const svgSpider = `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
    ${rings.map(r=>`<path d="${ringPath(r)}" fill="none" stroke="#E2E8F0" stroke-width="1"/>`).join("")}
    ${skillResults.map((_,i)=>{const[x,y]=point(i,R);return`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#E2E8F0" stroke-width="1"/>`;}).join("")}
    <path d="${dataPath}" fill="rgba(59,130,246,0.12)" stroke="#3B82F6" stroke-width="3" stroke-linejoin="round"/>
    ${dataPoints.map(([x,y],i)=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${colArr[i]}" stroke="white" stroke-width="2"/>`).join("")}
    ${rings.map(r=>{const[x,y]=point(0,R*r);return`<text x="${(x+5).toFixed(1)}" y="${(y-4).toFixed(1)}" font-size="11" fill="#94A3B8">${Math.round(r*100)}%</text>`;}).join("")}
    ${skillResults.map((s,i)=>{
      const[x,y]=point(i,R+40);
      const anchor=x<cx-5?"end":x>cx+5?"start":"middle";
      const words=s.name.split(" ");
      const lines=[];let cur="";
      words.forEach(w=>{if((cur+" "+w).length>14){lines.push(cur);cur=w;}else cur=cur?cur+" "+w:w;});
      if(cur)lines.push(cur);
      const tspans=lines.map((ln,li)=>`<tspan x="${x.toFixed(1)}" dy="${li===0?0:14}">${ln}</tspan>`).join("");
      return`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-size="12" font-weight="600" fill="#1E293B" font-family="Georgia,serif">${tspans}<tspan x="${x.toFixed(1)}" dy="15" font-size="13" font-weight="800" fill="${colArr[i]}">${Math.round(s.ratio*100)}%</tspan></text>`;
    }).join("")}
  </svg>`;

  const tableRows = skillResults.map((s, rank) => `
    <tr style="background:${rank%2===0?"#F8FAFC":"#fff"}">
      <td style="padding:11px 14px;font-weight:700;color:#64748B">#${rank+1}</td>
      <td style="padding:11px 14px">
        <span style="display:inline-flex;align-items:center;gap:8px">
          <span style="width:12px;height:12px;border-radius:50%;background:${colArr[rank]};display:inline-block;flex-shrink:0"></span>
          <strong style="color:#1E293B">${s.name}</strong>
        </span>
      </td>
      <td style="padding:11px 14px;text-align:center">
        <span style="background:#EFF6FF;color:#1E40AF;padding:3px 12px;border-radius:999px;font-weight:800;font-size:14px">${Math.round(s.ratio*100)}%</span>
      </td>
      <td style="padding:11px 14px;text-align:center;color:#475569">${s.raw} / ${s.maxScore}</td>
      <td style="padding:11px 14px;text-align:center;color:#475569">${s.appearances}</td>
      <td style="padding:11px 14px;text-align:center">
        <span style="color:#10B981;font-weight:700">${s.first}×</span>
        <span style="color:#CBD5E1;margin:0 3px">/</span>
        <span style="color:#3B82F6;font-weight:700">${s.second}×</span>
        <span style="color:#CBD5E1;margin:0 3px">/</span>
        <span style="color:#94A3B8;font-weight:700">${s.third}×</span>
      </td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Αναφορά — ${candidateName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Source+Sans+3:wght@400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Source Sans 3',sans-serif;background:#F1F5F9;color:#1E293B}
    .page{max-width:920px;margin:0 auto;background:#fff;box-shadow:0 0 40px rgba(0,0,0,0.08)}
    .cover{background:linear-gradient(135deg,#0F172A 0%,#1E3A5F 60%,#0F172A 100%);padding:56px 64px;color:#fff;position:relative;overflow:hidden}
    .cover::after{content:'';position:absolute;top:-60px;right:-60px;width:280px;height:280px;background:rgba(59,130,246,0.12);border-radius:50%}
    .cover-badge{display:inline-block;background:rgba(59,130,246,0.2);border:1px solid rgba(59,130,246,0.4);color:#93C5FD;padding:4px 16px;border-radius:999px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:28px}
    .cover-title{font-family:'Playfair Display',serif;font-size:38px;font-weight:700;line-height:1.2;margin-bottom:6px}
    .cover-sub{color:#94A3B8;font-size:17px;font-style:italic;margin-bottom:44px}
    .cover-meta{display:grid;grid-template-columns:1fr 1fr;gap:20px}
    .meta-item label{color:#64748B;font-size:11px;text-transform:uppercase;letter-spacing:.08em;display:block;margin-bottom:3px}
    .meta-item value{color:#F1F5F9;font-size:17px;font-weight:700;display:block}
    .section{padding:44px 64px;border-bottom:1px solid #F1F5F9}
    .section-title{font-family:'Playfair Display',serif;font-size:22px;color:#0F172A;margin-bottom:6px}
    .section-sub{color:#64748B;font-size:13px;margin-bottom:28px;line-height:1.5}
    .spider-wrap{display:flex;justify-content:center;padding:16px 0}
    table{width:100%;border-collapse:collapse;font-size:14px}
    thead th{background:#0F172A;color:#fff;padding:12px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.07em}
    thead th:not(:nth-child(2)){text-align:center}
    tbody tr:hover{background:#EFF6FF!important}
    .legend{display:flex;gap:20px;margin-top:18px;flex-wrap:wrap;font-size:13px;color:#64748B}
    .legend-dot{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:5px}
    .footer{padding:20px 64px;background:#F8FAFC;display:flex;justify-content:space-between;align-items:center}
    .footer-text{color:#94A3B8;font-size:12px}
    .print-btn{position:fixed;bottom:28px;right:28px;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;border:none;border-radius:12px;padding:14px 28px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(99,102,241,0.4);font-family:'Source Sans 3',sans-serif}
    @media print{
      body{background:#fff}
      .print-btn{display:none}
      .page{max-width:100%;box-shadow:none}
      .cover,.cover-badge,thead{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    }
  </style>
</head>
<body>
<div class="page">
  <div class="cover">
    <div class="cover-badge">ΑΣΕΠ 2026 · Αξιολόγηση Εργασιακών Συμπεριφορών</div>
    <h1 class="cover-title">Αναφορά<br>Προφίλ Δεξιοτήτων</h1>
    <p class="cover-sub">Εθνικό Πλαίσιο Δεξιοτήτων Δημόσιας Διοίκησης</p>
    <div class="cover-meta">
      <div class="meta-item"><label>Υποψήφιος</label><value>${candidateName}</value></div>
      <div class="meta-item"><label>Κωδικός</label><value>${candidateCode||"—"}</value></div>
      <div class="meta-item"><label>Ημερομηνία</label><value>${date}</value></div>
      <div class="meta-item"><label>Κορυφαία Δεξιότητα</label><value>${skillResults[0].name}</value></div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Αραχνόγραμμα Δεξιοτήτων</h2>
    <p class="section-sub">Κάθε άξονας εκφράζει το Ratio επίδοσης: <strong>Μόρια ÷ (Εμφανίσεις × 3)</strong><br>
    Υψηλότερη τιμή = ισχυρότερη τάση προς αυτή τη δεξιότητα στις αυθόρμητες επιλογές του υποψηφίου</p>
    <div class="spider-wrap">${svgSpider}</div>
  </div>

  <div class="section">
    <h2 class="section-title">Αναλυτικά Αποτελέσματα</h2>
    <p class="section-sub">Κατάταξη βάσει Ratio · Επιλογές: <span style="color:#10B981;font-weight:700">1η (3μόρια)</span> / <span style="color:#3B82F6;font-weight:700">2η (2μόρια)</span> / <span style="color:#94A3B8;font-weight:700">3η (1μόριο)</span></p>
    <table>
      <thead>
        <tr>
          <th>#</th><th>Δεξιότητα</th><th>Ratio %</th><th>Μόρια</th><th>Εμφανίσεις</th><th>1η / 2η / 3η</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="legend">
      <span><span class="legend-dot" style="background:#10B981"></span>1η επιλογή = 3 μόρια</span>
      <span><span class="legend-dot" style="background:#3B82F6"></span>2η επιλογή = 2 μόρια</span>
      <span><span class="legend-dot" style="background:#94A3B8"></span>3η επιλογή = 1 μόριο</span>
      <span style="margin-left:auto;color:#94A3B8">Ratio = Μόρια ÷ (Εμφανίσεις × 3)</span>
    </div>
  </div>

  ${(()=>{
    const cm = consistency ? getConsistencyMeta(consistency.overall) : null;
    const borderCol = cm ? cm.color : "#94A3B8";
    const labelText = cm ? cm.label : "—";
    const noteText  = cm ? cm.note  : "";
    const overall   = cm ? consistency.overall         : "—";
    const trait     = cm ? consistency.traitStability  : "—";
    const pair      = cm ? consistency.pairConsistency : "—";
    const pattern   = cm ? consistency.patternScore    : "—";
    const components = [
      {
        name: "Σταθερότητα χαρακτηριστικών",
        weight: "40%",
        value: trait,
        definition: "Μετρά κατά πόσο ο υποψήφιος επιλέγει με συνέπεια δηλώσεις που αντιστοιχούν στις ίδιες δεξιότητες σε όλη τη διάρκεια της δοκιμασίας. Χαμηλή σταθερότητα υποδηλώνει ότι το προφίλ δεξιοτήτων μεταβάλλεται σημαντικά από τριάδα σε τριάδα."
      },
      {
        name: "Συνοχή ζευγών δηλώσεων",
        weight: "40%",
        value: pair,
        definition: "Εξετάζει αν δηλώσεις που μετρούν την ίδια δεξιότητα και εμφανίζονται σε διαφορετικές τριάδες λαμβάνουν συνεπείς βαθμολογίες. Σοβαρή ασυνέπεια (π.χ. «1η επιλογή» σε μία τριάδα και «3η επιλογή» σε άλλη για την ίδια δεξιότητα) μειώνει τον δείκτη."
      },
      {
        name: "Μοτίβο απαντήσεων",
        weight: "20%",
        value: pattern,
        definition: "Ανιχνεύει μη ρεαλιστικά μοτίβα επιλογών, όπως συστηματική επιλογή κοινωνικά επιθυμητών δηλώσεων (faking good). Σε ένα ipsative τεστ 76 τριάδων, αναμένεται ισορροπημένη κατανομή μεταξύ 1ης, 2ης και 3ης επιλογής."
      },
    ];
    return `<div class="section" style="border-left:5px solid ${borderCol};padding-left:59px;">
      <h2 class="section-title">Δείκτης Συνέπειας Απαντήσεων</h2>
      <p class="section-sub">Αξιολογεί την αξιοπιστία και εσωτερική συνοχή των επιλογών του υποψηφίου. <strong>Δεν επηρεάζει τη βαθμολογία δεξιοτήτων</strong> — λειτουργεί ως δείκτης εγκυρότητας για την ερμηνεία των αποτελεσμάτων.</p>
      <div style="display:flex;align-items:center;gap:24px;margin-bottom:28px;padding:20px;background:#F8FAFC;border-radius:10px;">
        <div style="font-size:56px;font-weight:800;color:${borderCol};font-family:'Source Sans 3',sans-serif;line-height:1;flex-shrink:0">${overall}%</div>
        <div>
          <div style="font-size:19px;font-weight:700;color:${borderCol};margin-bottom:6px">${labelText}</div>
          <div style="color:#475569;font-size:13px;line-height:1.6;max-width:460px">${noteText}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#0F172A;color:#fff">
            <th style="padding:11px 14px;text-align:left;width:22%">Συνιστώσα</th>
            <th style="padding:11px 14px;text-align:left">Ορισμός</th>
            <th style="padding:11px 14px;text-align:center;width:9%">Βαρύτητα</th>
            <th style="padding:11px 14px;text-align:center;width:9%">Τιμή</th>
          </tr>
        </thead>
        <tbody>
          ${components.map((c, i) => `
          <tr style="background:${i%2===0?"#F8FAFC":"#fff"};vertical-align:top">
            <td style="padding:13px 14px;font-weight:700;color:#1E293B">${c.name}</td>
            <td style="padding:13px 14px;color:#475569;line-height:1.55">${c.definition}</td>
            <td style="padding:13px 14px;text-align:center;color:#64748B;font-weight:600">${c.weight}</td>
            <td style="padding:13px 14px;text-align:center;font-weight:800;font-size:15px;color:${borderCol}">${c.value}%</td>
          </tr>`).join("")}
        </tbody>
      </table>
      <p style="margin-top:16px;font-size:12px;color:#94A3B8;font-style:italic">
        ⚠️ Σύμφωνα με τη μεθοδολογία SHL OPQ32: δείκτης &lt;60% υποδηλώνει ότι τα αποτελέσματα χρήζουν προσεκτικής ερμηνείας και ενδέχεται να απαιτηθεί επανεξέταση μέσω δομημένης συνέντευξης.
      </p>
    </div>`;
  })()}

  <div class="footer">
    <span class="footer-text">Δοκιμασία Εργασιακών Συμπεριφορών · ΑΣΕΠ 2026</span>
    <span class="footer-text">⚠️ Εμπιστευτικό έγγραφο</span>
  </div>
</div>
<button class="print-btn" onclick="window.print()">🖨️ Εκτύπωση / PDF</button>
</body>
</html>`;
}

function WelcomeScreen({ data, onStart }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const canStart = name.trim().length >= 2;
  return (
    <div style={styles.welcome}>
      <div style={styles.welcomeInner}>
        <div style={styles.badge}>ΑΣΕΠ 2026</div>
        <h1 style={styles.heroTitle}>{data.meta.title}</h1>
        <p style={styles.heroSubtitle}>{data.meta.subtitle}</p>
        <div style={styles.candidateBox}>
          <h3 style={styles.candidateTitle}>Στοιχεία Υποψηφίου</h3>
          <div style={styles.fieldGroup}>
            <label style={styles.fieldLabel}>Όνομα / Nickname <span style={{color:"#EF4444"}}>*</span></label>
            <input style={styles.fieldInput} type="text" placeholder="π.χ. Γιώργης ή user_42"
              value={name} onChange={e=>setName(e.target.value)} maxLength={50}/>
          </div>
          <div style={{...styles.fieldGroup, marginBottom:0}}>
            <label style={styles.fieldLabel}>Κωδικός Συμμετοχής <span style={{color:"#64748B",fontSize:12}}>(προαιρετικό)</span></label>
            <input style={styles.fieldInput} type="text" placeholder="π.χ. AM-2026-001"
              value={code} onChange={e=>setCode(e.target.value)} maxLength={30}/>
          </div>
        </div>
        <div style={styles.infoGrid}>
          {[["📝","Τριάδες",data.meta.total_triads],["⏱️","Χρόνος",`${data.meta.time_limit_minutes} λεπτά`],["📊","Βαρύτητα",`${data.meta.weight_percent}%`]].map(([icon,label,val])=>(
            <div key={label} style={styles.infoCard}>
              <span style={styles.infoIcon}>{icon}</span>
              <span style={styles.infoLabel}>{label}</span>
              <span style={styles.infoValue}>{val}</span>
            </div>
          ))}
        </div>
        <div style={styles.instructionsBox}>
          <h3 style={styles.instrTitle}>Οδηγίες</h3>
          {data.meta.instructions_long.map((line,i)=>(
            <p key={i} style={styles.instrLine}><span style={styles.instrBullet}>›</span> {line}</p>
          ))}
        </div>
        <button style={{...styles.startBtn, opacity:canStart?1:0.4, cursor:canStart?"pointer":"not-allowed"}}
          onClick={()=>canStart&&onStart(name.trim(),code.trim())} disabled={!canStart}>
          Έναρξη Δοκιμασίας →
        </button>
        {!canStart && <p style={{color:"#94A3B8",fontSize:13,marginTop:10,fontFamily:"sans-serif"}}>Εισάγετε τουλάχιστον 2 χαρακτήρες για το όνομα</p>}
      </div>
    </div>
  );
}

function TriadScreen({ data, currentIdx, answers, onAnswer, onPrev, onFinish, timerProps }) {
  const triad = data.triads[currentIdx];
  const total = data.triads.length;
  const progress = Math.round((currentIdx/total)*100);
  const answer = answers[currentIdx]||{first:null,second:null,third:null};
  const {first:firstChoice, second:secondChoice, third:thirdChoice} = answer;
  const step = firstChoice===null?1:secondChoice===null?2:3;
  const isComplete = firstChoice!==null&&secondChoice!==null&&thirdChoice!==null;

  function handleSelect(stmtId) {
    if(step===1){onAnswer(currentIdx,{first:stmtId,second:null,third:null});}
    else if(step===2){
      const newThird=triad.statements.find(s=>s.id!==firstChoice&&s.id!==stmtId).id;
      onAnswer(currentIdx,{first:firstChoice,second:stmtId,third:newThird});
    }
  }
  function getState(id){
    if(id===firstChoice)return"chosen-first";
    if(id===secondChoice)return"chosen-second";
    if(id===thirdChoice)return"chosen-third";
    return"available";
  }
  return (
    <div style={styles.triadScreen}>
      <div style={styles.header}>
        <span style={styles.triadBadge}>Τριάδα {triad.triad_number} / {total}</span>
        <div style={styles.progressBar}><div style={{...styles.progressFill,width:`${progress}%`}}/></div>
        <span style={styles.progressText}>{progress}%</span>
        <TimerDisplay {...timerProps}/>
      </div>
      <div style={styles.stepBox}>
        {step===1&&<p style={styles.stepText}>Βήμα 1: Ποια δήλωση σας αντιπροσωπεύει <strong>περισσότερο</strong>;</p>}
        {step===2&&<p style={styles.stepText}>Βήμα 2: Από τις υπόλοιπες δύο, ποια σας αντιπροσωπεύει περισσότερο;</p>}
        {step===3&&<p style={{...styles.stepText,background:"#F0FDF4",borderColor:"#86EFAC",color:"#166534"}}>✅ Ολοκληρώθηκε! Προχωρήστε στην επόμενη τριάδα.</p>}
      </div>
      <div style={styles.statements}>
        {triad.statements.map(stmt=>{
          const state=getState(stmt.id);
          const isDisabled=step===2&&stmt.id===firstChoice;
          const isClickable=!isComplete&&!isDisabled;
          const label=state==="chosen-first"?"1η επιλογή":state==="chosen-second"?"2η επιλογή":state==="chosen-third"?"3η επιλογή":null;
          return(
            <div key={stmt.id} style={{...styles.stmtCard,
              ...(state==="chosen-first"?styles.stmtFirst:{}),
              ...(state==="chosen-second"?styles.stmtSecond:{}),
              ...(state==="chosen-third"?styles.stmtThird:{}),
              ...(isDisabled?styles.stmtDisabled:{}),
              cursor:isClickable?"pointer":"default"}}
              onClick={()=>isClickable&&handleSelect(stmt.id)}>
              <span style={styles.stmtId}>{stmt.id}</span>
              <p style={styles.stmtText}>{stmt.text}</p>
              {label&&<span style={{...styles.rankBadge,background:state==="chosen-first"?"#10B981":state==="chosen-second"?"#3B82F6":"#94A3B8"}}>{label}</span>}
            </div>
          );
        })}
      </div>
      <div style={styles.nav}>
        <button style={{...styles.navBtn,...styles.navBtnSecondary,opacity:currentIdx===0?0.4:1}}
          disabled={currentIdx===0} onClick={onPrev}>← Προηγούμενη</button>
        {isComplete&&currentIdx<total-1&&(
          <button style={{...styles.navBtn,...styles.navBtnPrimary}} onClick={()=>onAnswer(currentIdx,answer,true)}>Επόμενη →</button>
        )}
        {isComplete&&currentIdx===total-1&&(
          <button style={{...styles.navBtn,...styles.navBtnFinish}} onClick={onFinish}>Υποβολή ✓</button>
        )}
      </div>
    </div>
  );
}

function ResultsScreen({ data, answers, candidateName, candidateCode, onRestart }) {
  const skillResults = computeResults(data, answers);
  const consistency  = computeConsistency(data, answers);
  const consMeta     = getConsistencyMeta(consistency.overall);
  const date = new Date().toLocaleDateString("el-GR",{day:"numeric",month:"long",year:"numeric"});

  function openReport() {
    const html = generateReportHTML(candidateName, candidateCode, skillResults, date, consistency);
    const win = window.open("","_blank");
    win.document.write(html);
    win.document.close();
  }

  return (
    <div style={styles.results}>
      <div style={styles.resultsInner}>
        <div style={styles.resultsBadge}>Αποτελέσματα</div>
        <h2 style={styles.resultsTitle}>Το προφίλ σας</h2>
        <p style={styles.resultsSubtitle}><strong>{candidateName}</strong> · Κορυφαία: <strong>{skillResults[0].name}</strong> {SKILL_ICONS[skillResults[0].code]}</p>
        <div style={{display:"flex",justifyContent:"center",margin:"20px 0"}}>
          <SpiderChart skillResults={skillResults} size={320}/>
        </div>
        <div style={styles.skillGrid}>
          {skillResults.map((skill,rank)=>(
            <div key={skill.code} style={styles.skillRow}>
              <div style={styles.skillRankNum}>#{rank+1}</div>
              <div style={styles.skillInfo}>
                <div style={styles.skillHeader}>
                  <span>{SKILL_ICONS[skill.code]}</span>
                  <span style={styles.skillName}>{skill.name}</span>
                  <span style={styles.skillPct}>{Math.round(skill.ratio*100)}%</span>
                </div>
                <div style={styles.skillBarBg}>
                  <div style={{...styles.skillBarFill,width:`${Math.round(skill.ratio*100)}%`,background:SKILL_COLORS[skill.code]}}/>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:8}}>
          <button style={styles.reportBtn} onClick={openReport}>📄 Αναλυτική Αναφορά (νέο tab)</button>
          <button style={styles.restartBtn} onClick={onRestart}>🔄 Νέα Δοκιμασία</button>
        </div>


      </div>
    </div>
  );
}

function TimeUpScreen({ onViewResults }) {
  return (
    <div style={{...styles.welcome,background:"linear-gradient(135deg,#450a0a 0%,#7f1d1d 50%,#450a0a 100%)"}}>
      <div style={{...styles.welcomeInner,textAlign:"center"}}>
        <div style={{fontSize:72,marginBottom:24}}>⏰</div>
        <h1 style={{...styles.heroTitle,color:"#FEE2E2"}}>Ο χρόνος σας έληξε!</h1>
        <p style={{color:"#FCA5A5",fontSize:18,marginBottom:40,fontFamily:"sans-serif"}}>Η δοκιμασία υποβλήθηκε αυτόματα.</p>
        <button style={{...styles.startBtn,background:"linear-gradient(135deg,#DC2626,#991B1B)"}} onClick={onViewResults}>
          Δείτε τα Αποτελέσματά σας →
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [screen, setScreen] = useState("loading");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState(null);
  const [timerActive, setTimerActive] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [candidateCode, setCandidateCode] = useState("");

  useEffect(()=>{
    fetch(process.env.PUBLIC_URL+"/asep_test.json")
      .then(r=>r.json())
      .then(d=>{setData(d);setScreen("welcome");})
      .catch(()=>setError("Δεν ήταν δυνατή η φόρτωση των δεδομένων."));
  },[]);

  const handleExpire = useCallback(()=>{setTimerActive(false);setScreen("timeup");},[]);
  const timerProps = useTimer(timerActive, handleExpire);

  function handleAnswer(idx,answer,advance=false){
    setAnswers(prev=>({...prev,[idx]:answer}));
    if(advance&&idx<data.triads.length-1)setCurrentIdx(idx+1);
  }
  function handleStart(name,code){setCandidateName(name);setCandidateCode(code);setScreen("test");setTimerActive(true);}
  function handleRestart(){setAnswers({});setCurrentIdx(0);setCandidateName("");setCandidateCode("");setTimerActive(false);setScreen("welcome");}

  if(error)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",color:"#fff",background:"#0F172A",fontFamily:"sans-serif"}}><p>{error}</p></div>;
  if(screen==="loading")return<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",color:"#94A3B8",background:"#0F172A",fontFamily:"sans-serif"}}><p>⏳ Φόρτωση...</p></div>;
  if(screen==="welcome")return<WelcomeScreen data={data} onStart={handleStart}/>;
  if(screen==="test")return<TriadScreen data={data} currentIdx={currentIdx} answers={answers} onAnswer={handleAnswer} onPrev={()=>currentIdx>0&&setCurrentIdx(currentIdx-1)} onFinish={()=>{setTimerActive(false);setScreen("results");}} timerProps={timerProps}/>;
  if(screen==="timeup")return<TimeUpScreen onViewResults={()=>setScreen("results")}/>;
  if(screen==="results")return<ResultsScreen data={data} answers={answers} candidateName={candidateName} candidateCode={candidateCode} onRestart={handleRestart}/>;
}

const styles = {
  welcome:{minHeight:"100vh",background:"linear-gradient(135deg,#0F172A 0%,#1E3A5F 50%,#0F172A 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",fontFamily:"Georgia,serif"},
  welcomeInner:{maxWidth:680,width:"100%",textAlign:"center"},
  badge:{display:"inline-block",background:"rgba(59,130,246,0.2)",border:"1px solid rgba(59,130,246,0.5)",color:"#93C5FD",padding:"4px 16px",borderRadius:999,fontSize:13,letterSpacing:".1em",textTransform:"uppercase",marginBottom:24},
  heroTitle:{color:"#F1F5F9",fontSize:"clamp(28px,5vw,44px)",fontWeight:700,margin:"0 0 8px",lineHeight:1.15},
  heroSubtitle:{color:"#94A3B8",fontSize:20,margin:"0 0 28px",fontStyle:"italic"},
  candidateBox:{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:16,padding:"24px 28px",marginBottom:28,textAlign:"left"},
  candidateTitle:{color:"#93C5FD",fontSize:15,fontWeight:600,marginBottom:16,fontFamily:"sans-serif"},
  fieldGroup:{marginBottom:14},
  fieldLabel:{color:"#CBD5E1",fontSize:13,display:"block",marginBottom:6,fontFamily:"sans-serif"},
  fieldInput:{width:"100%",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,padding:"10px 14px",color:"#F1F5F9",fontSize:15,fontFamily:"sans-serif",outline:"none"},
  infoGrid:{display:"flex",gap:16,justifyContent:"center",marginBottom:28,flexWrap:"wrap"},
  infoCard:{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"16px 24px",display:"flex",flexDirection:"column",alignItems:"center",gap:4,minWidth:120},
  infoIcon:{fontSize:24},
  infoLabel:{color:"#64748B",fontSize:12,textTransform:"uppercase",letterSpacing:".05em"},
  infoValue:{color:"#E2E8F0",fontSize:20,fontWeight:700},
  instructionsBox:{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:28,marginBottom:28,textAlign:"left"},
  instrTitle:{color:"#93C5FD",margin:"0 0 16px",fontSize:16,fontWeight:600,fontFamily:"sans-serif"},
  instrLine:{color:"#CBD5E1",fontSize:14,margin:"6px 0",display:"flex",gap:8,fontFamily:"sans-serif"},
  instrBullet:{color:"#3B82F6",flexShrink:0,fontSize:16},
  startBtn:{background:"linear-gradient(135deg,#3B82F6,#6366F1)",color:"#fff",border:"none",borderRadius:12,padding:"16px 48px",fontSize:18,fontWeight:700,cursor:"pointer",fontFamily:"sans-serif",boxShadow:"0 4px 24px rgba(99,102,241,0.4)"},
  triadScreen:{minHeight:"100vh",background:"#F8FAFC",display:"flex",flexDirection:"column",fontFamily:"sans-serif"},
  header:{background:"#fff",borderBottom:"1px solid #E2E8F0",padding:"12px 24px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:10,flexWrap:"wrap"},
  triadBadge:{background:"#EFF6FF",color:"#3B82F6",border:"1px solid #BFDBFE",borderRadius:999,padding:"4px 12px",fontSize:13,fontWeight:600,flexShrink:0},
  progressBar:{flex:1,height:8,background:"#E2E8F0",borderRadius:999,overflow:"hidden",minWidth:60},
  progressFill:{height:"100%",background:"linear-gradient(90deg,#3B82F6,#6366F1)",borderRadius:999,transition:"width 0.4s ease"},
  progressText:{color:"#64748B",fontSize:13,fontWeight:600,flexShrink:0},
  stepBox:{maxWidth:760,margin:"24px auto 0",width:"100%",padding:"0 16px"},
  stepText:{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:10,padding:"12px 20px",color:"#1E40AF",fontSize:15,margin:0},
  statements:{maxWidth:760,margin:"16px auto",width:"100%",padding:"0 16px",display:"flex",flexDirection:"column",gap:12},
  stmtCard:{background:"#fff",border:"2px solid #E2E8F0",borderRadius:14,padding:"20px",display:"flex",alignItems:"flex-start",gap:16,transition:"border-color 0.2s,box-shadow 0.2s",userSelect:"none"},
  stmtFirst:{border:"2px solid #10B981",background:"#F0FDF4",boxShadow:"0 0 0 4px rgba(16,185,129,0.1)"},
  stmtSecond:{border:"2px solid #3B82F6",background:"#EFF6FF",boxShadow:"0 0 0 4px rgba(59,130,246,0.1)"},
  stmtThird:{border:"2px solid #CBD5E1",background:"#F8FAFC",opacity:0.7},
  stmtDisabled:{opacity:0.45},
  stmtId:{background:"#F1F5F9",color:"#64748B",borderRadius:8,padding:"4px 10px",fontSize:13,fontWeight:700,flexShrink:0},
  stmtText:{color:"#1E293B",fontSize:16,lineHeight:1.6,margin:0,flex:1},
  rankBadge:{color:"#fff",borderRadius:999,padding:"4px 12px",fontSize:12,fontWeight:700,flexShrink:0},
  nav:{maxWidth:760,margin:"8px auto 32px",width:"100%",padding:"0 16px",display:"flex",justifyContent:"space-between",gap:12},
  navBtn:{border:"none",borderRadius:10,padding:"12px 28px",fontSize:15,fontWeight:600,cursor:"pointer"},
  navBtnSecondary:{background:"#F1F5F9",color:"#64748B"},
  navBtnPrimary:{background:"linear-gradient(135deg,#3B82F6,#6366F1)",color:"#fff",boxShadow:"0 4px 16px rgba(99,102,241,0.3)"},
  navBtnFinish:{background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",boxShadow:"0 4px 16px rgba(16,185,129,0.3)"},
  results:{minHeight:"100vh",background:"linear-gradient(135deg,#0F172A 0%,#1E3A5F 50%,#0F172A 100%)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"40px 24px",fontFamily:"sans-serif"},
  resultsInner:{maxWidth:700,width:"100%"},
  resultsBadge:{display:"inline-block",background:"rgba(16,185,129,0.2)",border:"1px solid rgba(16,185,129,0.5)",color:"#6EE7B7",padding:"4px 16px",borderRadius:999,fontSize:13,letterSpacing:".1em",textTransform:"uppercase",marginBottom:16},
  resultsTitle:{color:"#F1F5F9",fontSize:36,fontWeight:700,margin:"0 0 8px",fontFamily:"Georgia,serif"},
  resultsSubtitle:{color:"#94A3B8",fontSize:16,margin:"0 0 16px"},
  skillGrid:{display:"flex",flexDirection:"column",gap:10,marginBottom:28},
  skillRow:{display:"flex",alignItems:"center",gap:16,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:14},
  skillRankNum:{color:"#475569",fontSize:14,fontWeight:700,minWidth:32,flexShrink:0},
  skillInfo:{flex:1},
  skillHeader:{display:"flex",alignItems:"center",gap:8,marginBottom:6},
  skillName:{color:"#E2E8F0",fontSize:14,fontWeight:600,flex:1},
  skillPct:{color:"#94A3B8",fontSize:14,fontWeight:700},
  skillBarBg:{height:7,background:"rgba(255,255,255,0.1)",borderRadius:999,overflow:"hidden"},
  skillBarFill:{height:"100%",borderRadius:999,transition:"width 0.8s cubic-bezier(0.4,0,0.2,1)"},
  reportBtn:{background:"linear-gradient(135deg,#3B82F6,#6366F1)",border:"none",color:"#fff",borderRadius:10,padding:"13px 28px",fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 16px rgba(99,102,241,0.35)"},
  restartBtn:{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",color:"#E2E8F0",borderRadius:10,padding:"13px 28px",fontSize:15,fontWeight:600,cursor:"pointer"},
};
