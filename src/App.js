import { useState, useEffect, useRef } from "react";

const SKILL_ICONS = {
  1: "🏛️", 2: "🤝", 3: "🔄", 4: "🎯",
  5: "📋", 6: "💡", 7: "⚖️", 8: "📚", 9: "🌟"
};

const SKILL_COLORS = {
  1: "#3B82F6", 2: "#10B981", 3: "#F59E0B", 4: "#EF4444",
  5: "#8B5CF6", 6: "#EC4899", 7: "#14B8A6", 8: "#F97316", 9: "#6366F1"
};

const TOTAL_SECONDS = 30 * 60; // 30 minutes

function useTimer(isRunning, onExpire) {
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!isRunning) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          onExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [isRunning, onExpire]);

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  const isWarning = secondsLeft <= 300; // last 5 minutes
  const isCritical = secondsLeft <= 60; // last 1 minute

  return { minutes, seconds, isWarning, isCritical, secondsLeft };
}

function TimerDisplay({ minutes, seconds, isWarning, isCritical }) {
  return (
    <div style={{
      ...styles.timerBox,
      background: isCritical ? "#FEE2E2" : isWarning ? "#FEF3C7" : "#EFF6FF",
      border: `2px solid ${isCritical ? "#EF4444" : isWarning ? "#F59E0B" : "#BFDBFE"}`,
      animation: isCritical ? "pulse 1s infinite" : "none",
    }}>
      <span style={{ fontSize: 14 }}>⏱️</span>
      <span style={{
        ...styles.timerText,
        color: isCritical ? "#DC2626" : isWarning ? "#D97706" : "#1E40AF",
        fontWeight: isCritical ? 800 : 700,
      }}>
        {minutes}:{seconds}
      </span>
      {isWarning && !isCritical && <span style={{ fontSize: 11, color: "#D97706", fontWeight: 600 }}>⚠️</span>}
      {isCritical && <span style={{ fontSize: 11, color: "#DC2626", fontWeight: 600 }}>!</span>}
    </div>
  );
}

function WelcomeScreen({ data, onStart }) {
  return (
    <div style={styles.welcome}>
      <div style={styles.welcomeInner}>
        <div style={styles.badge}>ΑΣΕΠ 2026</div>
        <h1 style={styles.heroTitle}>{data.meta.title}</h1>
        <p style={styles.heroSubtitle}>{data.meta.subtitle}</p>
        <div style={styles.infoGrid}>
          <div style={styles.infoCard}>
            <span style={styles.infoIcon}>📝</span>
            <span style={styles.infoLabel}>Τριάδες</span>
            <span style={styles.infoValue}>{data.meta.total_triads}</span>
          </div>
          <div style={styles.infoCard}>
            <span style={styles.infoIcon}>⏱️</span>
            <span style={styles.infoLabel}>Χρόνος</span>
            <span style={styles.infoValue}>{data.meta.time_limit_minutes} λεπτά</span>
          </div>
          <div style={styles.infoCard}>
            <span style={styles.infoIcon}>📊</span>
            <span style={styles.infoLabel}>Βαρύτητα</span>
            <span style={styles.infoValue}>{data.meta.weight_percent}%</span>
          </div>
        </div>
        <div style={styles.instructionsBox}>
          <h3 style={styles.instrTitle}>Οδηγίες</h3>
          {data.meta.instructions_long.map((line, i) => (
            <p key={i} style={styles.instrLine}>
              <span style={styles.instrBullet}>›</span> {line}
            </p>
          ))}
        </div>
        <button style={styles.startBtn} onClick={onStart}>
          Έναρξη Δοκιμασίας →
        </button>
      </div>
    </div>
  );
}

function TriadScreen({ data, currentIdx, answers, onAnswer, onPrev, onFinish, timerProps }) {
  const triad = data.triads[currentIdx];
  const total = data.triads.length;
  const progress = Math.round((currentIdx / total) * 100);
  const answer = answers[currentIdx] || { first: null, second: null, third: null };
  const { first: firstChoice, second: secondChoice, third: thirdChoice } = answer;
  const step = firstChoice === null ? 1 : secondChoice === null ? 2 : 3;
  const isComplete = firstChoice !== null && secondChoice !== null && thirdChoice !== null;

  function handleSelect(stmtId) {
    if (step === 1) {
      onAnswer(currentIdx, { first: stmtId, second: null, third: null });
    } else if (step === 2) {
      const newThird = triad.statements.find(s => s.id !== firstChoice && s.id !== stmtId).id;
      onAnswer(currentIdx, { first: firstChoice, second: stmtId, third: newThird });
    }
  }

  function getStmtState(stmtId) {
    if (stmtId === firstChoice) return "chosen-first";
    if (stmtId === secondChoice) return "chosen-second";
    if (stmtId === thirdChoice) return "chosen-third";
    return "available";
  }

  function rankLabel(state) {
    if (state === "chosen-first") return "1η επιλογή";
    if (state === "chosen-second") return "2η επιλογή";
    if (state === "chosen-third") return "3η επιλογή";
    return null;
  }

  return (
    <div style={styles.triadScreen}>
      {/* Header with timer */}
      <div style={styles.header}>
        <span style={styles.triadBadge}>Τριάδα {triad.triad_number} / {total}</span>
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>
        <span style={styles.progressText}>{progress}%</span>
        <TimerDisplay {...timerProps} />
      </div>

      <div style={styles.stepBox}>
        {step === 1 && <p style={styles.stepText}>Βήμα 1: Ποια δήλωση σας αντιπροσωπεύει <strong>περισσότερο</strong>;</p>}
        {step === 2 && <p style={styles.stepText}>Βήμα 2: Από τις υπόλοιπες δύο, ποια σας αντιπροσωπεύει περισσότερο;</p>}
        {step === 3 && <p style={{ ...styles.stepText, background: "#F0FDF4", borderColor: "#86EFAC", color: "#166534" }}>✅ Ολοκληρώθηκε! Προχωρήστε στην επόμενη τριάδα.</p>}
      </div>

      <div style={styles.statements}>
        {triad.statements.map((stmt) => {
          const state = getStmtState(stmt.id);
          const isDisabled = step === 2 && stmt.id === firstChoice;
          const isClickable = !isComplete && !isDisabled;
          const label = rankLabel(state);
          return (
            <div
              key={stmt.id}
              style={{
                ...styles.stmtCard,
                ...(state === "chosen-first" ? styles.stmtFirst : {}),
                ...(state === "chosen-second" ? styles.stmtSecond : {}),
                ...(state === "chosen-third" ? styles.stmtThird : {}),
                ...(isDisabled ? styles.stmtDisabled : {}),
                cursor: isClickable ? "pointer" : "default",
              }}
              onClick={() => isClickable && handleSelect(stmt.id)}
            >
              <span style={styles.stmtId}>{stmt.id}</span>
              <p style={styles.stmtText}>{stmt.text}</p>
              {label && (
                <span style={{
                  ...styles.rankBadge,
                  background: state === "chosen-first" ? "#10B981" : state === "chosen-second" ? "#3B82F6" : "#94A3B8"
                }}>{label}</span>
              )}
            </div>
          );
        })}
      </div>

      <div style={styles.nav}>
        <button
          style={{ ...styles.navBtn, ...styles.navBtnSecondary, opacity: currentIdx === 0 ? 0.4 : 1 }}
          disabled={currentIdx === 0}
          onClick={onPrev}
        >← Προηγούμενη</button>

        {isComplete && currentIdx < total - 1 && (
          <button style={{ ...styles.navBtn, ...styles.navBtnPrimary }}
            onClick={() => onAnswer(currentIdx, answer, true)}>
            Επόμενη →
          </button>
        )}
        {isComplete && currentIdx === total - 1 && (
          <button style={{ ...styles.navBtn, ...styles.navBtnFinish }} onClick={onFinish}>
            Υποβολή ✓
          </button>
        )}
      </div>
    </div>
  );
}

function TimeUpScreen({ onViewResults }) {
  return (
    <div style={{ ...styles.welcome, background: "linear-gradient(135deg, #450a0a 0%, #7f1d1d 50%, #450a0a 100%)" }}>
      <div style={{ ...styles.welcomeInner, textAlign: "center" }}>
        <div style={{ fontSize: 72, marginBottom: 24 }}>⏰</div>
        <h1 style={{ ...styles.heroTitle, color: "#FEE2E2" }}>Ο χρόνος σας έληξε!</h1>
        <p style={{ color: "#FCA5A5", fontSize: 18, marginBottom: 40 }}>
          Η δοκιμασία υποβλήθηκε αυτόματα με τις απαντήσεις που έχετε δώσει μέχρι τώρα.
        </p>
        <button
          style={{ ...styles.startBtn, background: "linear-gradient(135deg, #DC2626, #991B1B)" }}
          onClick={onViewResults}
        >
          Δείτε τα Αποτελέσματά σας →
        </button>
      </div>
    </div>
  );
}

function ResultsScreen({ data, answers, onRestart }) {
  const scores = {};
  data.skills.forEach(s => { scores[s.code] = { raw: 0, appearances: 0 }; });
  data.triads.forEach((triad, idx) => {
    const answer = answers[idx];
    if (!answer) return;
    triad.statements.forEach(stmt => {
      if (!stmt.skill_code) return;
      let pts = stmt.id === answer.first ? 3 : stmt.id === answer.second ? 2 : stmt.id === answer.third ? 1 : 0;
      scores[stmt.skill_code].raw += pts;
      scores[stmt.skill_code].appearances++;
    });
  });

  const skillResults = data.skills.map(s => ({
    ...s,
    raw: scores[s.code].raw,
    percent: scores[s.code].appearances > 0
      ? Math.round((scores[s.code].raw / (scores[s.code].appearances * 3)) * 100)
      : 0
  })).sort((a, b) => b.percent - a.percent);

  return (
    <div style={styles.results}>
      <div style={styles.resultsInner}>
        <div style={styles.resultsBadge}>Αποτελέσματα</div>
        <h2 style={styles.resultsTitle}>Το προφίλ σας</h2>
        <p style={styles.resultsSubtitle}>
          Κορυφαία δεξιότητα: <strong>{skillResults[0].name}</strong> {SKILL_ICONS[skillResults[0].code]}
        </p>
        <div style={styles.skillGrid}>
          {skillResults.map((skill, rank) => (
            <div key={skill.code} style={styles.skillRow}>
              <div style={styles.skillRankNum}>#{rank + 1}</div>
              <div style={styles.skillInfo}>
                <div style={styles.skillHeader}>
                  <span>{SKILL_ICONS[skill.code]}</span>
                  <span style={styles.skillName}>{skill.name}</span>
                  <span style={styles.skillPct}>{skill.percent}%</span>
                </div>
                <div style={styles.skillBarBg}>
                  <div style={{ ...styles.skillBarFill, width: `${skill.percent}%`, background: SKILL_COLORS[skill.code] }} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <button style={styles.restartBtn} onClick={onRestart}>🔄 Νέα Δοκιμασία</button>
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
  const [timeExpired, setTimeExpired] = useState(false);

  useEffect(() => {
    fetch(process.env.PUBLIC_URL + "/asep_test.json")
      .then(r => r.json())
      .then(d => { setData(d); setScreen("welcome"); })
      .catch(() => setError("Δεν ήταν δυνατή η φόρτωση των δεδομένων."));
  }, []);

  function handleExpire() {
    setTimerActive(false);
    setTimeExpired(true);
    setScreen("timeup");
  }

  const timerProps = useTimer(timerActive, handleExpire);

  function handleAnswer(idx, answer, advance = false) {
    setAnswers(prev => ({ ...prev, [idx]: answer }));
    if (advance && idx < data.triads.length - 1) setCurrentIdx(idx + 1);
  }

  function handleStart() {
    setScreen("test");
    setTimerActive(true);
  }

  function handleFinish() {
    setTimerActive(false);
    setScreen("results");
  }

  function handleRestart() {
    setAnswers({});
    setCurrentIdx(0);
    setTimeExpired(false);
    setTimerActive(false);
    setScreen("welcome");
  }

  if (error) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif", color: "#fff", background: "#0F172A" }}><p>{error}</p></div>;
  if (screen === "loading") return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif", color: "#94A3B8", background: "#0F172A" }}><p>⏳ Φόρτωση...</p></div>;
  if (screen === "welcome") return <WelcomeScreen data={data} onStart={handleStart} />;
  if (screen === "test") return <TriadScreen data={data} currentIdx={currentIdx} answers={answers} onAnswer={handleAnswer} onPrev={() => currentIdx > 0 && setCurrentIdx(currentIdx - 1)} onFinish={handleFinish} timerProps={timerProps} />;
  if (screen === "timeup") return <TimeUpScreen onViewResults={() => setScreen("results")} />;
  if (screen === "results") return <ResultsScreen data={data} answers={answers} onRestart={handleRestart} />;
}

const styles = {
  welcome: { minHeight: "100vh", background: "linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #0F172A 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "Georgia, serif" },
  welcomeInner: { maxWidth: 680, width: "100%", textAlign: "center" },
  badge: { display: "inline-block", background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.5)", color: "#93C5FD", padding: "4px 16px", borderRadius: 999, fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 24 },
  heroTitle: { color: "#F1F5F9", fontSize: "clamp(28px,5vw,44px)", fontWeight: 700, margin: "0 0 8px", lineHeight: 1.15 },
  heroSubtitle: { color: "#94A3B8", fontSize: 20, margin: "0 0 40px", fontStyle: "italic" },
  infoGrid: { display: "flex", gap: 16, justifyContent: "center", marginBottom: 40, flexWrap: "wrap" },
  infoCard: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "16px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 120 },
  infoIcon: { fontSize: 24 },
  infoLabel: { color: "#64748B", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" },
  infoValue: { color: "#E2E8F0", fontSize: 20, fontWeight: 700 },
  instructionsBox: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 28, marginBottom: 40, textAlign: "left" },
  instrTitle: { color: "#93C5FD", margin: "0 0 16px", fontSize: 16, fontWeight: 600, fontFamily: "sans-serif" },
  instrLine: { color: "#CBD5E1", fontSize: 14, margin: "6px 0", display: "flex", gap: 8, fontFamily: "sans-serif" },
  instrBullet: { color: "#3B82F6", flexShrink: 0, fontSize: 16 },
  startBtn: { background: "linear-gradient(135deg, #3B82F6, #6366F1)", color: "#fff", border: "none", borderRadius: 12, padding: "16px 48px", fontSize: 18, fontWeight: 700, cursor: "pointer", fontFamily: "sans-serif", boxShadow: "0 4px 24px rgba(99,102,241,0.4)" },
  triadScreen: { minHeight: "100vh", background: "#F8FAFC", display: "flex", flexDirection: "column", fontFamily: "sans-serif" },
  header: { background: "#fff", borderBottom: "1px solid #E2E8F0", padding: "12px 24px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 10, flexWrap: "wrap" },
  triadBadge: { background: "#EFF6FF", color: "#3B82F6", border: "1px solid #BFDBFE", borderRadius: 999, padding: "4px 12px", fontSize: 13, fontWeight: 600, flexShrink: 0 },
  progressBar: { flex: 1, height: 8, background: "#E2E8F0", borderRadius: 999, overflow: "hidden", minWidth: 60 },
  progressFill: { height: "100%", background: "linear-gradient(90deg, #3B82F6, #6366F1)", borderRadius: 999, transition: "width 0.4s ease" },
  progressText: { color: "#64748B", fontSize: 13, fontWeight: 600, flexShrink: 0 },
  timerBox: { display: "flex", alignItems: "center", gap: 6, borderRadius: 10, padding: "6px 14px", flexShrink: 0, transition: "all 0.5s ease" },
  timerText: { fontSize: 18, fontFamily: "monospace", letterSpacing: "0.05em" },
  stepBox: { maxWidth: 760, margin: "24px auto 0", width: "100%", padding: "0 16px" },
  stepText: { background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "12px 20px", color: "#1E40AF", fontSize: 15, margin: 0 },
  statements: { maxWidth: 760, margin: "16px auto", width: "100%", padding: "0 16px", display: "flex", flexDirection: "column", gap: 12 },
  stmtCard: { background: "#fff", border: "2px solid #E2E8F0", borderRadius: 14, padding: "20px", display: "flex", alignItems: "flex-start", gap: 16, transition: "border-color 0.2s, box-shadow 0.2s", userSelect: "none" },
  stmtFirst: { border: "2px solid #10B981", background: "#F0FDF4", boxShadow: "0 0 0 4px rgba(16,185,129,0.1)" },
  stmtSecond: { border: "2px solid #3B82F6", background: "#EFF6FF", boxShadow: "0 0 0 4px rgba(59,130,246,0.1)" },
  stmtThird: { border: "2px solid #CBD5E1", background: "#F8FAFC", opacity: 0.7 },
  stmtDisabled: { opacity: 0.45 },
  stmtId: { background: "#F1F5F9", color: "#64748B", borderRadius: 8, padding: "4px 10px", fontSize: 13, fontWeight: 700, flexShrink: 0 },
  stmtText: { color: "#1E293B", fontSize: 16, lineHeight: 1.6, margin: 0, flex: 1 },
  rankBadge: { color: "#fff", borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  nav: { maxWidth: 760, margin: "8px auto 32px", width: "100%", padding: "0 16px", display: "flex", justifyContent: "space-between", gap: 12 },
  navBtn: { border: "none", borderRadius: 10, padding: "12px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer" },
  navBtnSecondary: { background: "#F1F5F9", color: "#64748B" },
  navBtnPrimary: { background: "linear-gradient(135deg, #3B82F6, #6366F1)", color: "#fff", boxShadow: "0 4px 16px rgba(99,102,241,0.3)" },
  navBtnFinish: { background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff", boxShadow: "0 4px 16px rgba(16,185,129,0.3)" },
  results: { minHeight: "100vh", background: "linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #0F172A 100%)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 24px", fontFamily: "sans-serif" },
  resultsInner: { maxWidth: 680, width: "100%" },
  resultsBadge: { display: "inline-block", background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.5)", color: "#6EE7B7", padding: "4px 16px", borderRadius: 999, fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 },
  resultsTitle: { color: "#F1F5F9", fontSize: 36, fontWeight: 700, margin: "0 0 8px", fontFamily: "Georgia, serif" },
  resultsSubtitle: { color: "#94A3B8", fontSize: 16, margin: "0 0 40px" },
  skillGrid: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 40 },
  skillRow: { display: "flex", alignItems: "center", gap: 16, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 16 },
  skillRankNum: { color: "#475569", fontSize: 14, fontWeight: 700, minWidth: 32, flexShrink: 0 },
  skillInfo: { flex: 1 },
  skillHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  skillName: { color: "#E2E8F0", fontSize: 14, fontWeight: 600, flex: 1 },
  skillPct: { color: "#94A3B8", fontSize: 14, fontWeight: 700 },
  skillBarBg: { height: 8, background: "rgba(255,255,255,0.1)", borderRadius: 999, overflow: "hidden" },
  skillBarFill: { height: "100%", borderRadius: 999, transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)" },
  restartBtn: { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#E2E8F0", borderRadius: 10, padding: "12px 32px", fontSize: 15, fontWeight: 600, cursor: "pointer" },
};
