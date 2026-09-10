(function(root){'use strict';
  function hasContextField(o, key) {
    return !!o && Object.prototype.hasOwnProperty.call(o, key);
  }

  function paymentContextFor(o) {
    if (!o) return { phase: 'unknown', due: 0, dueKnown: false, claimed: false, claimedKnown: false };
    var dueKnown = !!(o.due_now && hasContextField(o.due_now, 'amount'));
    var rawDue = dueKnown ? Number(o.due_now.amount) : 0;
    if (!dueKnown && o.status === 'prepay' && (hasContextField(o, 'prepay_due') || hasContextField(o, 'prepay'))) {
      dueKnown = true;
      rawDue = Number(hasContextField(o, 'prepay_due') ? o.prepay_due : o.prepay);
    }
    var due = isFinite(rawDue) && rawDue > 0 ? rawDue : 0;
    var paymentsKnown = Array.isArray(o.payments);
    var claimedKnown = hasContextField(o, 'claimed') || paymentsKnown;
    var claimed = o.claimed === true || (paymentsKnown && o.payments.some(function (p) {
      return p && (p.status === 'claimed' || p.state === 'claimed');
    }));
    var ready = !!(o.part_ready || o.final_ready);
    var phase = claimed ? 'checking'
      : (!dueKnown || !claimedKnown) ? 'unknown'
      : due > 0 ? 'due'
      : o.status === 'prepay' ? 'preparing'
      : ready ? 'transfer'
      : 'none';
    return {
      phase: phase,
      due: due,
      dueKnown: dueKnown,
      claimed: claimed,
      claimedKnown: claimedKnown
    };
  }

  function caseContextFor(o) {
    var payment = paymentContextFor(o);
    var paused = !!(o && o.paused);
    var terminal = !!(o && (o.status === 'done' || o.status === 'cancel'));
    var action = null;
    if (o && !paused && !terminal) {
      if (payment.phase === 'due') {
        action = { kind: 'payment', score: 5, jump: 'secPay', icon: 'wallet' };
      } else if (o.status === 'priced') {
        action = { kind: 'price', score: 4, jump: 'secDecide', icon: 'wallet' };
      } else if (o.status === 'check') {
        action = { kind: 'review', score: 3, jump: 'secDecide', icon: 'documents' };
      } else if (Number(o.files_new) > 0) {
        action = { kind: 'files', score: 2, jump: 'secFiles', icon: 'documents' };
      } else if (Number(o.unread) > 0) {
        action = { kind: 'message', score: 1, jump: 'secChat', icon: 'messages' };
      }
    }
    var destination = 'work';
    if (paused) {
      destination = (o.actions || []).indexOf('unpause') >= 0 ? 'terms' : 'chat';
    } else if (action) {
      destination = action.jump === 'secPay' ? 'money'
        : action.jump === 'secFiles' ? 'files'
        : action.jump === 'secChat' ? 'chat' : 'work';
    } else if (payment.phase === 'checking') {
      destination = 'money';
    }
    return {
      payment: payment.phase,
      due: payment.due,
      dueKnown: payment.dueKnown,
      claimed: payment.claimed,
      claimedKnown: payment.claimedKnown,
      owner: paused ? 'paused' : action ? 'client' : 'master',
      action: action,
      destination: destination
    };
  }

  function nowActionFor(o) {
    return caseContextFor(o).action;
  }

  function resolveNowAction(list, getDaysLeft) {
    var best = null;
    (list || []).forEach(function (o, index) {
      var action = nowActionFor(o);
      if (!action) return;
      var rawDays = typeof getDaysLeft === 'function' ? getDaysLeft(o) : null;
      var days = typeof rawDays === 'number' && isFinite(rawDays) ? rawDays : null;
      if (!best || action.score > best.action.score ||
          (action.score === best.action.score && days !== null &&
           (best.days === null || days < best.days))) {
        best = { order: o, action: action, days: days, index: index };
      }
    });
    return best;
  }


  function dateOnly(v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return '';
    var d = new Date(v + 'T12:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0,10) === v ? v : '';
  }
  function today() { var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function agenda(orders, milestones, now) {
    now=dateOnly(now)||today();
    var rows=[];
    (orders||[]).forEach(function(o){
      if (o.archived || ['done','cancel','cancelled','closed','refund'].indexOf(o.status)>=0) return;
      var date=dateOnly(o.deadline_date);
      if(date || o.deadline_text) rows.push({key:'order-'+Number(o.id),id:Number(o.id),date:date,when:o.deadline_text||date,title:o.work_label||o.topic||'Заказ',ref:o.no||'Заказ',own:false});
    });
    (milestones||[]).forEach(function(m){var date=dateOnly(m.due);if(date) rows.push({key:'milestone-'+Number(m.id),id:Number(m.id),date:date,title:m.title||'Моя дата',own:true});});
    rows.forEach(function(r){r.past=!!r.date&&r.date<now;r.days=r.date?Math.round((Date.parse(r.date+'T12:00:00Z')-Date.parse(now+'T12:00:00Z'))/86400000):null;});
    return rows.sort(function(a,b){return (a.past-b.past)||((a.date||'9999').localeCompare(b.date||'9999'))||a.key.localeCompare(b.key);});
  }
  function ics(rows,anonymous,stamp) {
    function escapeICS(s){return String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
    function fold(s){var lines=[],current='',bytes=0;Array.from(s).forEach(function(c){var n=new TextEncoder().encode(c).length;if(bytes+n>73){lines.push(current);current=' ';bytes=1;}current+=c;bytes+=n;});lines.push(current);return lines.join('\r\n');}
    var lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Academic Salon//Personal calendar//RU','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Моя учёба'];
    (rows||[]).filter(function(r){return dateOnly(r.date);}).forEach(function(r){var end=new Date(r.date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);lines.push('BEGIN:VEVENT','UID:'+r.key+'@calendar.akademsalon.ru','DTSTAMP:'+(stamp||new Date().toISOString()).replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART;VALUE=DATE:'+r.date.replace(/-/g,''),'DTEND;VALUE=DATE:'+end.toISOString().slice(0,10).replace(/-/g,''),'SUMMARY:'+escapeICS(anonymous?'Учебная задача':r.title),'BEGIN:VALARM','TRIGGER:-P1D','ACTION:DISPLAY','DESCRIPTION:Завтра учебная задача','END:VALARM','END:VEVENT');});
    lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
  }

const domain={paymentContextFor,caseContextFor,resolveNowAction,agenda,ics};if(typeof module==='object'&&module.exports)module.exports=domain;else root.SalonOrderDomain=domain;})(typeof window==='object'?window:globalThis);
