export const icons={
    email:'<path d="M3 6h18v12H3z"/><path d="m3 6 9 7 9-7"/>',
    projects:'<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10M7 4.8l9 5.1v5"/>',
    tasks:'<path d="M8 5h13M8 12h13M8 19h13"/><circle cx="3" cy="5" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="19" r="1"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18M7 14h2M12 14h2M17 14h1M7 18h2M12 18h2"/>',
    knowledge:'<path d="M12 5v16M12 5C9 3 5 3 2 4v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z"/>',
    approvals:'<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 4V2h6v2M8 12l3 3 5-6"/>',
    production:'<path d="M3 8h18v12H3zM3 8l-1-5 18-2 1 5-18 2ZM6 3l3 4M12 2l3 4M8 13l5-3v7z"/>',
    engineering:'<path d="m9 3 .7-2h4.6l.7 2 2 1.2 2.2-.4 2.3 4-1.4 1.7v2.9l1.4 1.7-2.3 4-2.2-.4-2 1.2-.7 2H9.7l-.7-2-2-1.2-2.2.4-2.3-4 1.4-1.7V9.5L2.5 7.8l2.3-4 2.2.4z" transform="translate(.3 1) scale(.95)"/><circle cx="12" cy="12" r="3.6"/>',
    monitoring:'<path d="M2 12h3l2-8 4 17 3-19 3 14 2-4h3"/>',
    admin:'<circle cx="12" cy="7" r="3"/><circle cx="4" cy="9" r="2"/><circle cx="20" cy="9" r="2"/><path d="M6 21v-4a6 6 0 0 1 12 0v4M2 19v-3a3 3 0 0 1 3-3M22 19v-3a3 3 0 0 0-3-3"/>',
    research:'<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7"/>',
    arrowRight:'<path d="m9 5 7 7-7 7"/>',arrowLeft:'<path d="m15 5-7 7 7 7"/>',
    send:'<path d="m3 3 19 9-19 9 4-9-4-9ZM7 12h15"/>',
    mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v4M8 23h8"/>',
    attach:'<path d="m8 17 8-8a3 3 0 0 0-4-4L4 13a5 5 0 0 0 7 7l9-9a7 7 0 0 0-10-10L2 9" transform="translate(2 2) scale(.85)"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',pause:'<path d="M8 4v16M16 4v16"/>',play:'<path d="m7 3 13 9-13 9z"/>',
    check:'<path d="m4 12 5 5L20 6"/>',bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',server:'<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6h.1M7 17h.1M12 6h5M12 17h5"/>'
  };
export function svg(name,cls=''){return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.tasks}</svg>`;}
export const agents=[
    {key:'production',name:'Production Agent',desc:'Crews · OBs · Schedules<br>Runs · Logistics'},
    {key:'engineering',name:'Engineering Agent',desc:'Infrastructure · Networks<br>SRT · Systems'},
    {key:'monitoring',name:'Monitoring Agent',desc:'Streams · Signals · Health<br>Alerts · Recordings'},
    {key:'scheduling',name:'Scheduling Agent',icon:'calendar',desc:'Plans · Resources<br>Crew · Venues'},
    {key:'admin',name:'Admin Agent',desc:'People · Processes<br>Docs · Communication'},
    {key:'research',name:'Research Agent',icon:'knowledge',desc:'Industry · Vendors<br>Standards · Analysis'}
  ];
export const data=[
    {key:'email',name:'Email',meta:'12 new',note:'3 require reply',progress:42},
    {key:'projects',name:'Projects',meta:'8 active',note:'2 due this week',progress:65},
    {key:'tasks',name:'Tasks',meta:'24 open',note:'6 high priority',progress:44},
    {key:'calendar',name:'Calendar',meta:'3 today',note:'2 tomorrow',progress:27},
    {key:'knowledge',name:'Knowledge',meta:'147 items',note:'12 new this week',progress:52},
    {key:'approvals',name:'Approvals',meta:'3 pending',note:'1 urgent',progress:58}
  ];
export function decoration(key){
    if(key==='tasks')return '<svg viewBox="0 0 86 50"><g stroke="currentColor" opacity=".6"><path d="M29 10h48M29 22h38M29 34h46M29 46h29"/></g><g fill="currentColor"><circle cx="19" cy="10" r="2.5"/><circle cx="19" cy="22" r="2.5"/><circle cx="19" cy="34" r="2.5"/><circle cx="19" cy="46" r="2.5"/></g></svg>';
    if(key==='calendar')return '<svg viewBox="0 0 86 50"><g fill="currentColor">'+Array.from({length:20},(_,i)=>`<circle cx="${27+(i%5)*12}" cy="${8+Math.floor(i/5)*12}" r="1.7" opacity="${.2+(i%4)*.2}"/>`).join('')+'</g></svg>';
    if(key==='email')return '<svg viewBox="0 0 86 50"><g stroke="currentColor" stroke-width="2">'+Array.from({length:13},(_,i)=>{let h=4+Math.sin(i*.65)**2*19;return `<path d="M${8+i*5} ${45-h}v${h}"/>`}).join('')+'</g></svg>';
    return '<svg viewBox="0 0 86 50"><path d="M16 42 32 22 51 31 64 9 76 38 51 31 32 46 32 22 64 9" stroke="currentColor" fill="none" opacity=".32"/><g fill="currentColor"><circle cx="16" cy="42" r="1.5"/><circle cx="32" cy="22" r="2"/><circle cx="51" cy="31" r="1.5"/><circle cx="64" cy="9" r="2"/><circle cx="76" cy="38" r="1.8"/></g></svg>';
  }
export function cardMarkup(d){return `<span class="glass-glow" aria-hidden="true"></span><span class="glass-content card-content"><span class="glass-icon" aria-hidden="true">${svg(d.key)}</span><span><strong class="card-title">${d.name}</strong><span class="card-meta">${d.meta}</span><span class="card-note">${d.note}</span></span><span class="card-decoration" aria-hidden="true">${decoration(d.key)}</span><span class="card-track" aria-hidden="true" style="--progress:${d.progress}%"></span></span>`;}
export function row(name,detail,tag,icon='check',tone=''){return {name,detail,tag,icon,tone};}
export function cardDetails(d){
    const entries={
      email:{description:'A sample inbox summary. Nothing is connected to your email account.',stats:[['12','New messages'],['3','Need a reply'],['2','Vendor updates']],rows:[row('Equipment quotation','Sample vendor message · review requested','Draft','email'),row('Tomorrow’s production brief','Sample team update · documents attached','Unread','production'),row('Crew availability','Example response · scheduling follow-up','Review','calendar','amber')]},
      projects:{description:'Your projects presented as a visual overview. All entries below are examples.',stats:[['8','Active projects'],['2','Upcoming milestones'],['3','Needs attention']],rows:[row('Live broadcast preparation','Example project · equipment and crew readiness','In progress','production'),row('Studio refresh','Example project · technical preparation','Planning','engineering'),row('Event production','Example project · documentation review','Review','projects','amber')]},
      tasks:{description:'Today’s priorities, collected in one place. These are demonstration tasks.',stats:[['24','Open tasks'],['6','High priority'],['3','Due today']],rows:[row('Confirm OB readiness','Engineering · sample pre-show check','Priority','engineering','amber'),row('Review tomorrow’s crew plan','Scheduling · sample assignment review','Today','calendar'),row('Prepare project documentation','Admin · sample preparation task','In progress','tasks')]},
      calendar:{description:'A sample schedule, not your connected calendar.',stats:[['3','Events today'],['2','Tomorrow'],['1','Preparation needed']],rows:[row('Production briefing','09:30 · sample event','Team','admin'),row('Technical preparation','13:00 · sample event','Engineering','engineering'),row('Project review','16:30 · sample event','Review','projects')]},
      knowledge:{description:'Example knowledge collections. No company documents have been imported.',stats:[['147','Saved items'],['12','New this week'],['6','Collections']],rows:[row('Broadcast playbooks','Example collection · operational checklists','Collection','knowledge'),row('Equipment notes','Example collection · device references','Reference','engineering'),row('Network procedures','Example collection · SRT and infrastructure','Technical','server')]},
      approvals:{description:'A preview of the review queue. Approval and sending actions are intentionally unavailable.',stats:[['3','Awaiting review'],['1','Urgent'],['0','Actions sent']],rows:[row('Equipment purchase request','Example request · quotation review','Urgent','approvals','pink'),row('Crew assignment change','Example request · schedule adjustment','Review','calendar','amber'),row('Vendor follow-up','Example request · message draft','Draft','email')]}
    };
    return {key:d.key,title:d.key==='tasks'?'Today’s tasks':d.name,icon:d.key,...entries[d.key]};
  }
export function agentDetails(a){return {key:a.key,title:a.name,icon:a.icon||a.key,description:'This specialist is represented in the interface only. No agent is running and no device is connected.',stats:[['Ready','Interface state'],['0','Live connections'],['Demo','Data source']],rows:[row('Role',a.desc.replace('<br>',' · '),'Preview',a.icon||a.key),row('Task delegation','Lucia sends a request; the agent returns a result.','Simulated','bolt'),row('Human control','No consequential actions are enabled in this preview.','UI only','approvals')]};}
