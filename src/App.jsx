import React, { memo, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { agents, data, icons, decoration } from './data/preview.js';
import { createLuciaController } from './engine/controller.js';
import './styles/lucia.css';

function Icon({ name, className = '' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icons[name] || icons.tasks }} />;
}

const Header = memo(function Header() {
  return <header className="topbar">
    <div className="brand"><span className="wordmark">LUCIA</span><span className="brand-detail"><b>AI COMMAND CENTER</b><small>for Live Broadcast Operations</small></span></div>
    <div className="header-actions">
      <span className="preview-label"><i /> SPATIAL UI PREVIEW</span>
      <button className="quiet-button" id="demo">Preview a task</button>
      <button className="icon-button" id="motion-toggle" aria-label="Pause decorative motion" aria-pressed="false" title="Pause motion"><Icon name="pause" /></button>
      <button className="icon-button" id="about" aria-label="About this UI preview">?</button>
    </div>
  </header>;
});

function Agent({ agent }) {
  return <button className="lucia-glass agent-glass" data-kind={agent.key} type="button" aria-haspopup="dialog" aria-label={`${agent.name}: open simulated details`}>
    <span className="glass-glow" aria-hidden="true" />
    <span className="agent-content">
      <span className="agent-icon"><Icon name={agent.icon || agent.key} /></span>
      <span className="agent-copy"><b>{agent.name}</b><span className="agent-status"><i /><span>Ready · preview</span></span>
        <small>{agent.desc.split('<br>').map((line, i) => <React.Fragment key={line}>{i > 0 && <br />}{line}</React.Fragment>)}</small>
      </span>
      <Icon name="arrowRight" className="agent-chevron" />
    </span>
  </button>;
}

const Stage = memo(function Stage() {
  return <section className="lucia-stage" aria-label="Lucia and specialist agents">
    <svg className="connections" aria-hidden="true"><g id="connection-lines" /><g id="connection-pulses" /></svg>
    <div className="agents agents-left" id="agents-left">{agents.slice(0, 3).map(a => <Agent key={a.key} agent={a} />)}</div>
    <div className="core" id="core"><div className="core-attitude" id="core-attitude">
      <img className="core-fallback" alt="" aria-hidden="true" />
      <canvas id="energy-canvas" aria-hidden="true" />
      <div className="core-center"><h1>LUCIA</h1><p id="core-status">Ready when you are</p>
        <div className="waveform" aria-hidden="true">{Array.from({ length: 19 }, (_, i) => <i key={i} style={{ '--i': i, height: `${4 + (1 - Math.abs(i - 9) / 10) * 26 * (.6 + (i % 3) * .2)}px` }} />)}</div>
        <span className="core-caption" id="core-caption">YOUR PERSONAL AI COMMAND CENTER</span>
      </div>
    </div></div>
    <div className="agents agents-right" id="agents-right">{agents.slice(3).map(a => <Agent key={a.key} agent={a} />)}</div>
    <p className="stage-state"><span className="status-dot" /><span id="stage-status">Six specialists. One intelligence.</span></p>
  </section>;
});

function CardFace({ card }) {
  return <>
    <span className="glass-glow" aria-hidden="true" />
    <span className="glass-content card-content">
      <span className="glass-icon" aria-hidden="true"><Icon name={card.key} /></span>
      <span><strong className="card-title">{card.name}</strong><span className="card-meta">{card.meta}</span><span className="card-note">{card.note}</span></span>
      <span className="card-decoration" aria-hidden="true" dangerouslySetInnerHTML={{ __html: decoration(card.key) }} />
      <span className="card-track" aria-hidden="true" style={{ '--progress': `${card.progress}%` }} />
    </span>
  </>;
}

const Carousel = memo(function Carousel() {
  return <section className="workspace" aria-label="Scrollable workspace cards">
    <button className="carousel-arrow previous" id="prev" aria-label="Previous card"><Icon name="arrowLeft" /></button>
    <div className="lucia-carousel" role="region" aria-roledescription="carousel" aria-label="Workspace. Drag, swipe, or use arrow keys." tabIndex="0">
      {data.map((card, i) => <div className="carousel-card" data-kind={card.key} key={card.key}>
        <button className="lucia-glass glass-card" type="button" data-index={i} aria-haspopup="dialog" aria-label={`${card.name}: ${card.meta}; ${card.note}. Simulated data.`}><CardFace card={card} /></button>
        <div className="card-reflection" aria-hidden="true" inert><div className="lucia-glass glass-card"><CardFace card={card} /></div></div>
      </div>)}
    </div>
    <button className="carousel-arrow next" id="next" aria-label="Next card"><Icon name="arrowRight" /></button>
    <div className="carousel-pagination" id="pagination" aria-label="Choose a card">{data.map(card => <button className="page-dot" type="button" key={card.key} aria-label={`Centre ${card.name}`} />)}</div>
    <span className="sr-only" id="carousel-announcement" aria-live="polite" />
  </section>;
});

const Composer = memo(function Composer() {
  return <footer className="composer-area">
    <div className="quick-tools">{['email', 'projects', 'tasks'].map(key => <button className="icon-button" data-shortcut={key} key={key} aria-label={`Open ${key} preview`} title={key[0].toUpperCase() + key.slice(1)}><Icon name={key} /></button>)}</div>
    <form className="lucia-glass composer" id="composer"><div className="glass-content">
      <button type="button" className="icon-button attachment" id="attach" aria-label="Attachment control preview"><Icon name="attach" /></button>
      <input id="prompt" aria-label="Type to Lucia — simulated UI only" placeholder="Type to Lucia…" autoComplete="off" maxLength="500" />
      <button type="button" className="icon-button microphone" id="mic" aria-label="Preview listening animation; microphone is not recorded"><Icon name="mic" /></button>
      <button className="send" aria-label="Preview request"><Icon name="send" /></button>
    </div></form>
    <p className="footer-note">INTERACTIVE UI STUDY <span>·</span> EXAMPLE DATA <span>·</span> NO LIVE CONNECTIONS</p>
  </footer>;
});

function Spotlight({ apiRef }) {
  const [details, setDetails] = useState(null);
  useImperativeHandle(apiRef, () => ({ showDetails: d => flushSync(() => setDetails(d)) }), []);
  return <dialog className="spotlight" aria-labelledby="spotlight-title" data-kind={details?.key}>
    <div className="spotlight-shell lucia-glass" aria-hidden="true"><span className="glass-glow" /></div>
    <div className="spotlight-content">
      <header className="spotlight-header"><span className="glass-icon dialog-icon" aria-hidden="true">{details && <Icon name={details.icon} />}</span><div><p className="eyebrow">LUCIA / SPOTLIGHT</p><h2 id="spotlight-title">{details?.title}</h2></div><button className="icon-button spotlight-close" aria-label="Close spotlight"><Icon name="close" /></button></header>
      <div className="spotlight-body">
        {details && <p className="spotlight-description">{details.description}</p>}
        {details?.stats && <div className="summary-grid">{details.stats.map(([value, label]) => <div className="summary-tile" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>}
        {details?.rows && <div className="detail-list">{details.rows.map(r => <div className="detail-item" key={r.name}><span className="detail-symbol"><Icon name={r.icon} /></span><div className="detail-copy"><strong>{r.name}</strong><small>{r.detail}</small></div><span className={`status-tag ${r.tone || ''}`}>{r.tag}</span></div>)}</div>}
        {details?.note && <p className="note-box">{details.note}</p>}
      </div>
      <footer className="spotlight-footer"><span><i className="status-dot" /> Simulated interface · no actions are sent</span><button className="glass-control close-footer">Back to Lucia</button></footer>
    </div>
  </dialog>;
}

export default function App() {
  const rootRef = useRef(null), spotlightRef = useRef(null);
  useEffect(() => {
    const controller = createLuciaController(rootRef.current, { showDetails: details => spotlightRef.current.showDetails(details) });
    return () => controller.destroy();
  }, []);
  return <main className="lucia-ui" id="app" ref={rootRef}>
    <canvas id="scene-canvas" aria-hidden="true" />
    <Header /><Stage /><Carousel /><Composer /><Spotlight apiRef={spotlightRef} />
    <div className="toast lucia-glass" role="status" hidden><span className="glass-content" /></div>
  </main>;
}
