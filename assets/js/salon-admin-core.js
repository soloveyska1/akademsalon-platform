/* Administrative domain and transport. No DOM, no legacy admin dependency. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SalonAdminCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const STATUS = Object.freeze({new:'Новая заявка',priced:'Предложение отправлено',prepay:'Ожидает оплаты',work:'В работе',check:'На проверке',fix:'Нужны правки',done:'Завершён',cancel:'Закрыт'});
  const ERRORS = Object.freeze({forbidden:'У аккаунта нет прав администратора.',unauthorized:'Сессия закончилась. Войди снова.',network:'Не удалось связаться с сервером. Обнови данные.',unknown:'Ответ не получен. Операция могла выполниться: сначала сверь результат.',identity_changed:'Аккаунт изменился. Обнови данные.',busy:'Предыдущая операция ещё выполняется.',pending:'Сначала сверь результат предыдущей операции.',storage:'Браузер не сохранил защиту от повторной операции. Разреши хранилище для сайта.',bad_price:'Проверь цену: нужна положительная сумма.',already_paid:'Оплата уже была. Условия зафиксированы.',claimed_pending:'Клиент отметил перевод. Сначала сверь оплату.',stage_unpaid:'Этап не оплачен. Сначала сверка оплаты или защищённый предпросмотр.',nothing_due:'Нет этапов, ожидающих оплаты.',already_done:'Действие уже выполнено. Обнови карточку.',bad_amount:'Проверь сумму.',bad_request:'Проверь заполненные поля.',bonus_empty:'На счёте клиента недостаточно бонусов.',no_contact:'Нет контакта для отправки.',gift_state:'Состояние сертификата изменилось. Обнови его.',telegram_not_linked:'У клиента не привязан Telegram.',order_has_owner:'Заказ уже принадлежит клиенту.',paused:'Заказ на паузе.',preview_failed:'Не удалось подготовить защищённую копию.',sanitize_failed:'Не удалось очистить свойства файла.',preview_format:'Для предпросмотра нужен PDF, DOCX, DOC, ODT, RTF, PPTX или PPT.',file_too_large:'Файл слишком большой.',not_found:'Запись не найдена. Обнови список.',plan_started:'Оплата по плану уже началась. План изменить нельзя.'});
  const esc = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const money = n => n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('ru-RU') + ' ₽';
  function date(value, time=false) { if(!value)return 'Не назначен';const s=String(value); const d=new Date(s.length===10?s+'T12:00:00':(/[Zz]|[+-]\d\d:\d\d$/.test(s)?s:s+'Z'));return isNaN(d)?s:d.toLocaleString('ru-RU',{day:'numeric',month:'short',...(time?{hour:'2-digit',minute:'2-digit'}:{})}); }
  function days(o, now=new Date()) {if(!o.deadline_date)return null; const end=new Date(String(o.deadline_date).slice(0,10)+'T23:59:59');return isNaN(end)?null:Math.ceil((end-now)/86400000)-1;}
  function attention(o, now) {
    if(o.status==='done'||o.status==='cancel'||o.archived_admin)return null;
    if(o.claimed||o.pay_claimed||o.payment_claimed||(o.payments||[]).some(p=>p.status==='claimed')||(o.pay_plan||o.plan||[]).some(p=>p.claimed||p.state==='claimed'))return {kind:'payment',label:'Сверить перевод',panel:'money',rank:0};
    if(o.fix_requested||o.status==='fix')return {kind:'fix',label:'Разобрать правки',panel:'messages',rank:1};
    const left=days(o,now);if(left!==null&&left<2)return {kind:'deadline',label:left<0?'Срок прошёл':left===0?'Срок сегодня':'Срок завтра',panel:'files',rank:2};
    if(o.status==='new')return {kind:'new',label:'Подготовить предложение',panel:'brief',rank:3};
    if(o.unread||o.unread_admin||o.admin_unread)return {kind:'message',label:'Ответить клиенту',panel:'messages',rank:4};
    return null;
  }
  function safeLink(value) {try{const u=new URL(String(value),'https://akademsalon.ru');return ['https:','http:','mailto:','tg:'].includes(u.protocol)?u.href:'';}catch(e){return '';}}
  function integer(value,{min=0,max=10000000}={}) {const raw=String(value??'').trim();if(!/^-?\d+$/.test(raw))return null;const n=Number(raw);return Number.isSafeInteger(n)&&n>=min&&n<=max?n:null;}
  function createGateway({fetch,base,headers,snapshot,onStatus,storage,onIdentityLost=()=>{}}) {
    let epoch=0, busy=false, pending={};const key='salon_admin_operations_v2';
    try{pending=JSON.parse(storage.getItem(key)||'{}');if(!pending||Array.isArray(pending)||typeof pending!=='object')pending={};}catch(e){}
    try{const legacy=JSON.parse(storage.getItem('salon_admin_uncertain_bonus')||'{}');Object.entries(legacy||{}).forEach(([id,v])=>{if(/^\d+$/.test(id)){const path='/admin/clients/'+id+'/bonus';if(!pending[path])pending[path]={at:v.at||Date.now(),path};}});}catch(e){}
    function persist(next){try{storage.setItem(key,JSON.stringify(next));pending=next;return true;}catch(e){return false;}}
    const stamp=()=>JSON.stringify(snapshot?snapshot():null);
    async function request(method,path,body,{multipart=false}={}) {
      const e=epoch,auth=stamp();let response;
      const controller=method==='GET'&&typeof AbortController!=='undefined'?new AbortController():null;
      const timer=controller?setTimeout(()=>controller.abort(),15000):null;
      try {
        const h=headers?headers(method):{};
        if(body!==undefined&&!multipart)h['Content-Type']='application/json';
        response=await fetch(base+path,{method,headers:h,credentials:'include',body:body===undefined?undefined:multipart?body:JSON.stringify(body),signal:controller?.signal});
        if(e!==epoch||auth!==stamp())return {ok:false,error:'identity_changed',uncertain:method!=='GET'};
        if(response.status===403){onIdentityLost();return {ok:false,error:'forbidden'};}
        if(response.status===401){onStatus?.(401,path,snapshot?.());onIdentityLost();return {ok:false,error:'unauthorized',uncertain:method!=='GET'};}
        let r;try{r=await response.json();}catch(err){return {ok:false,error:method==='GET'?'network':'unknown',uncertain:method!=='GET'};}
        if(e!==epoch||auth!==stamp())return {ok:false,error:'identity_changed',uncertain:method!=='GET'};
        if(!response.ok)return {ok:false,error:r?.error||'unknown',detail:r?.detail,uncertain:method!=='GET'&&response.status>=500};
        if(!r||typeof r!=='object'||typeof r.ok!=='boolean')return {ok:false,error:method==='GET'?'network':'unknown',uncertain:method!=='GET'};
        if(method!=='GET'&&!r.ok&&!['forbidden','bad_request','bad_amount','bad_price','bad_recip_email','bonus_empty','busy','order_has_owner','already_paid','claimed_pending','plan_locked','plan_started','financial_locked','financial_revision_requires_review','bad_specification','not_found','not_canceled','paused','nothing_due','stage_unpaid','gift_state','payment_target_ambiguous','payment_target_mismatch','duplicate_payment','no_contact','preview_format','file_too_large'].includes(r.error))return {...r,uncertain:true};
        return r;
      }catch(err){return {ok:false,error:method==='GET'?'network':'unknown',uncertain:method!=='GET'};}finally{if(timer)clearTimeout(timer);}
    }
    return {
      get:path=>request('GET',path),
      async mutate(path,body,opts={}) {
        if(busy)return {ok:false,error:'busy'};
        const lock=opts.lock||path.split('?')[0];
        if(pending[lock])return {ok:false,error:'pending',uncertain:true};
        if(!persist({...pending,[lock]:{at:Date.now(),path,readPath:opts.readPath||undefined}}))return {ok:false,error:'storage'};
        const e=epoch;busy=true;
        try{let r=await request('POST',path,body,opts);if(r.ok&&opts.validate&&!opts.validate(r))r={ok:false,error:'unknown',uncertain:true};if(!r.ok&&!['forbidden','bad_request','bad_amount','bad_price','bad_recip_email','bonus_empty','busy','order_has_owner','already_paid','claimed_pending','plan_locked','plan_started','financial_locked','financial_revision_requires_review','bad_specification','not_found','not_canceled','paused','nothing_due','stage_unpaid','gift_state','payment_target_ambiguous','payment_target_mismatch','duplicate_payment','no_contact','preview_format','file_too_large','qa_readonly'].includes(r.error))r={...r,uncertain:true};if(!r.uncertain){const next={...pending};delete next[lock];persist(next);}return r;}finally{if(e===epoch)busy=false;}
      },
      pending:()=>({...pending}),
      reconcile(lock){const m=lock.match(/^\/admin\/clients\/(\d+)\/bonus$/);if(m){try{const legacy=JSON.parse(storage.getItem('salon_admin_uncertain_bonus')||'{}');delete legacy[m[1]];storage.setItem('salon_admin_uncertain_bonus',JSON.stringify(legacy));}catch(e){return false;}}const next={...pending};delete next[lock];return persist(next);},
      invalidate(){epoch++;busy=false;},
      get epoch(){return epoch;},get busy(){return busy;}
    };
  }
  const SPEC_EXECUTOR_NAME="Семёнов Семён Юрьевич", RIGHTS_SCHEMA_VERSION=1, RIGHTS_MODE_B1="simple_license", RIGHTS_MODE_B2="exclusive_right_alienation";
  function specificationContour(value, serviceId) {
    value = String(value || '').toUpperCase();
    if (value.indexOf('B2') === 0 || value.indexOf('Б2') === 0) return 'B2';
    if (value.indexOf('B1') === 0 || value.indexOf('Б1') === 0) return 'B1';
    if (value.indexOf('A') === 0 || value.indexOf('А') === 0) return 'A';
    return serviceId === 'author' || serviceId === 'svc_author_order' ? 'B_PENDING' : 'A';
  }
  function specificationAcademicSubmode(row, contour, serviceId) {
    if (contour !== 'A') return '';
    row = row || {};
    var value = String(row.academic_submode || row.academicSubmode || '').toUpperCase();
    if (value === 'A1' || value === 'А1') return 'A1';
    if (value === 'A2' || value === 'А2') return 'A2';
    var routeResult = String(row.result_code || row.resultCode ||
      (row.case_context && row.case_context.result) || '').toLowerCase();
    var tier = String(row.tier || '').toLowerCase();
    var type = String(row.type || serviceId || '').toLowerCase();
    if (routeResult === 'support' || tier === 'vip' || type === 'work_vip') return 'A2';
    return 'A1';
  }
  function specificationAllocation(total, rows) {
    var weights = rows.map(function (row) {
      return Math.max(1, parseInt(row.final_price || row.price_rub || row.quote_low ||
        (row.quote_preview && row.quote_preview.low) || 1, 10) || 1);
    });
    var weightSum = weights.reduce(function (sum, value) { return sum + value; }, 0);
    var amounts = weights.map(function (value) { return Math.floor(total * value / weightSum); });
    var rest = total - amounts.reduce(function (sum, value) { return sum + value; }, 0);
    for (var i = 0; i < rest; i++) amounts[i % amounts.length]++;
    return amounts;
  }
  function specificationLinesForPrice(o, total) {
    var saved = o.specification_lines ||
      (o.specification && o.specification.lines) ||
      (o.offer && o.offer.specification_lines) ||
      (o.offer && o.offer.specification && o.offer.specification.lines) || [];
    var directItems = Array.isArray(o.items) && o.items.length ? o.items : [];
    var cartItems = o.cart && Array.isArray(o.cart.items) ? o.cart.items : [];
    var rows = saved.length ? saved : (directItems.length ? directItems : cartItems);
    if (!rows.length) {
      var fallbackContext = o.case_context && typeof o.case_context === 'object'
        ? o.case_context : {};
      rows = [{
        id:'order-' + o.id, label:o.work_label || 'Индивидуальная услуга',
        topic:o.topic || '', deadline_text:o.deadline_text || '',
        requirements:o.details || '',
        type:o.work_type || o.type || '',
        service_id:o.service_id || o.work_type || o.type || '',
        tier:o.tier || '',
        result_code:o.result_code || fallbackContext.result_code || fallbackContext.result || '',
        scope_code:o.scope_code || fallbackContext.scope_code || '',
        contract_contour:o.contract_contour || fallbackContext.contract_contour || (/^(author|svc_author_order)$/.test(o.service_id||o.work_type||o.type||'')?'B_PENDING':'A'),
        academic_submode:o.academic_submode || fallbackContext.academic_submode || '',
        legal_service_type:o.legal_service_type || '',
        permitted_purpose:o.permitted_purpose || '',
        author_participation:o.author_participation || null
      }];
    }
    var amounts = specificationAllocation(total, rows);
    return rows.map(function (source, index) {
      var row = {};
      Object.keys(source || {}).forEach(function (key) { row[key] = source[key]; });
      var answers = row.answers && typeof row.answers === 'object' ? row.answers : {};
      var authorProfile = row.actual_author_profile && typeof row.actual_author_profile === 'object'
        ? row.actual_author_profile : {};
      var rightsProvenance = row.rights_provenance &&
        typeof row.rights_provenance === 'object' ? row.rights_provenance : {};
      var scope = row.scope && typeof row.scope === 'object' ? row.scope : {};
      var inputs = row.customer_inputs && typeof row.customer_inputs === 'object'
        ? row.customer_inputs : {};
      var rawRequiredInputs = Array.isArray(scope.required_inputs)
        ? scope.required_inputs
        : (Array.isArray(row.required_inputs) ? row.required_inputs : []);
      var requiredInputs = rawRequiredInputs.map(function (value) {
        return String(value || '').trim().slice(0, 500);
      }).filter(Boolean);
      var rawDependencies = Array.isArray(row.dependencies)
        ? row.dependencies
        : (row.dependencies ? [row.dependencies] : []);
      var dependencies = rawDependencies.map(function (value) {
        return String(value || '').trim().slice(0, 1000);
      }).filter(Boolean);
      if (!dependencies.length && requiredInputs.length) {
        dependencies = [
          'Срок и работа по позиции начинаются после получения полного комплекта исходников: ' +
            requiredInputs.join('; ')
        ];
      }
      var serviceId = String(row.service_id || row.serviceId || row.catalog_id || row.type || '');
      var contour = specificationContour(row.contract_contour || answers.author_model, serviceId);
      var academicSubmode = specificationAcademicSubmode(row, contour, serviceId);
      var isA2 = academicSubmode === 'A2';
      var isAiEditing = /^(?:ai|svc_ai)$/i.test(serviceId);
      var title = String(row.title || row.label || o.work_label || ('Позиция ' + (index + 1)));
      var topic = String(row.topic || scope.topic || o.topic || '');
      var requirements = String(row.requirements || scope.customer_requirements || o.details || '');
      var actualAuthor = String(
        row.actual_author || authorProfile.name || authorProfile.author_name || ''
      );
      if (!actualAuthor) {
        actualAuthor = contour === 'A'
          ? (isA2
            ? 'Заказчик — автор финальной версии; мастерская готовит промежуточный рабочий черновик'
            : 'Заказчик — автор содержательной основы; мастерская оказывает согласованную консультационную или редакторскую услугу')
          : (contour === 'B1' ? SPEC_EXECUTOR_NAME : '');
      }
      var rights = String(row.rights_mode || row.intellectual_rights_profile || answers.rights || '');
      if (!rights && contour === 'A') {
        rights = 'Права на исходник сохраняются у Заказчика; мастерская отвечает за собственные консультационные и редакторские материалы';
      }
      var result = String(row.deliverable || row.result || row.plain_description || '');
      if (!result) {
        if (contour !== 'A') result = 'Авторский материал «' + title + '» в согласованном формате';
        else if (isA2) result = 'Промежуточный полный рабочий черновик и исследовательские материалы для содержательной проверки и доработки Заказчиком';
        else if (isAiEditing) result = 'Файл с видимыми правками и комментариями к фактам, источникам и логическим разрывам';
        else if (/norm|format|gost/i.test(serviceId)) result = 'Оформленная версия исходника с видимыми изменениями и листом проверки';
        else if (/review|razbor/i.test(serviceId)) result = 'Письменное экспертное заключение и карта замечаний по исходнику';
        else result = 'Письменный разбор, редакторские комментарии и согласованные изменения в материале Заказчика';
      }
      var included = row.inclusions || row.included || scope.included;
      if (!Array.isArray(included) || !included.length) included = isA2
        ? [
          'исследовательская карта, структура, источники и рабочий черновик по согласованным этапам',
          'контрольные точки для решений и проверки данных Заказчиком',
          'передача промежуточного результата в проверяемом формате'
        ]
        : isAiEditing
          ? [
            'сверка текста с исходным prompt',
            'проверка внутренней логики, фактических утверждений и связи с переданными источниками',
            'видимые редакторские правки и комментарии к неподтверждённым местам'
          ]
          : [
            'проверка исходника и требований, переданных по этой позиции',
            'операции, прямо названные в теме, требованиях и переписке дела',
            'передача согласованного результата в проверяемом формате'
          ];
      var excluded = row.exclusions || row.excluded || scope.excluded;
      if (!Array.isArray(excluded) || !excluded.length) excluded = contour === 'A'
        ? [
          'выполнение и сдача аттестационной работы вместо Заказчика',
          'гарантия оценки, допуска, процента оригинальности или решения комиссии',
          isAiEditing ? 'обход детекторов или подтверждение факта, для которого не передан проверяемый источник' : ''
        ]
        : [
          'использование результата в учебной или научной аттестации',
          'гарантия публикации, одобрения либо иного решения третьего лица'
        ];
      var criteria = row.acceptance_criteria;
      if (!Array.isArray(criteria) || !criteria.length) criteria = [
        'передан читаемый файл или иной прямо согласованный результат',
        'выполнены операции, перечисленные во включённом составе позиции',
        'тема, объём и формат соответствуют зафиксированным условиям'
      ];
      var performerProfiles = Array.isArray(row.performer_profiles)
        ? row.performer_profiles
        : (Array.isArray(rightsProvenance.performer_profiles)
          ? rightsProvenance.performer_profiles : []);
      var performers = performerProfiles.map(function (profile) {
        return profile && profile.name;
      }).filter(Boolean);
      excluded = excluded.filter(Boolean);
      var rightsBasis = row.rights_basis && typeof row.rights_basis === 'object'
        ? row.rights_basis : (rightsProvenance.basis || {});
      var rightsChain = Array.isArray(row.rights_chain)
        ? row.rights_chain
        : (Array.isArray(rightsProvenance.chain) ? rightsProvenance.chain : []);
      var rightsConfirmation = row.rights_confirmation &&
        typeof row.rights_confirmation === 'object'
        ? row.rights_confirmation : (rightsProvenance.confirmation || {});
      return {
        line_id:String(row.line_id || row.requested_line_id || row.client_id || row.id ||
          ('LN-' + String(index + 1).padStart(3, '0'))),
        parent_line_id:row.parent_line_id || row.parent_client_id || null,
        position:index + 1,
        service_id:isAiEditing ? 'ai' : serviceId,
        contract_contour:contour,
        academic_submode:academicSubmode,
        legal_service_type:row.legal_service_type ||
          (contour === 'A'
            ? (isA2 ? 'joint_research_development' : 'academic_support')
            : 'author_order_non_attestation'),
        title:title,
        label:title,
        t:title,
        plain_description:result,
        deliverable:result,
        quantity:Math.max(1, parseInt(row.quantity || row.qty || 1, 10) || 1),
        qty:Math.max(1, parseInt(row.quantity || row.qty || 1, 10) || 1),
        unit:row.unit || 'позиция',
        unit_definition:row.unit_definition ||
          ('1 позиция = один результат «' + title + '» с указанным составом'),
        permitted_purpose:row.permitted_purpose || answers.purpose ||
          (contour === 'A'
            ? (isA2
              ? 'Совместная исследовательская разработка с обязательным содержательным участием Заказчика; финальная авторская версия формируется Заказчиком'
              : 'Самостоятельная работа Заказчика с консультационной, редакторской или учебно-методической помощью мастерской')
            : 'Использование авторского материала только для прямо согласованной цели вне учебной и научной аттестации'),
        topic:topic,
        scope:{
          topic:topic,
          required_inputs:requiredInputs,
          included:included,
          excluded:excluded
        },
        inclusions:included,
        exclusions:excluded,
        customer_inputs:{
          description:requiredInputs.length
            ? ('До начала позиции Заказчик передаёт: ' + requiredInputs.join('; '))
            : inputs.description || (isAiEditing
            ? ('Исходный текст; исходный prompt: ' + String(answers.prompt || '') +
              '; сведения об источниках: ' + String(answers.sources || ''))
            : topic || requirements || 'Исходные материалы и требования, переданные в деле заказа'),
          required_inputs:requiredInputs,
          version:inputs.version || 'версия, зафиксированная в деле до начала позиции',
          source_material_required:isAiEditing || requiredInputs.length > 0,
          source_material_provided:isAiEditing
            ? inputs.source_material_provided === true : null,
          original_prompt:isAiEditing ? String(inputs.original_prompt || answers.prompt || '') : '',
          sources_disclosure:isAiEditing ? String(inputs.sources_disclosure || answers.sources || '') : ''
        },
        author_participation:isA2 ? (row.author_participation || {
          required:true,
          confirmed:false,
          checkpoints:[
            'утверждение проблемы, цели, метода и содержательных решений',
            'проверка фактов, источников и исходных данных',
            'содержательная доработка рабочего черновика и формирование финальной авторской версии'
          ]
        }) : null,
        acceptance_criteria:criteria,
        dependencies:dependencies,
        deadline_text:row.deadline_text || row.deadline || o.deadline_text || '',
        deadline_date:row.deadline_date || o.deadline_date || '',
        correction_window:{ days:7, scope:row.corrections_policy || 'устранение подтверждённых несоответствий этой позиции' },
        corrections_policy:String(row.corrections_policy || ''),
        iterations:Math.max(1, parseInt(row.iterations, 10) || 1),
        actual_author:actualAuthor,
        actual_author_profile:authorProfile,
        rights_mode:rights,
        rights_schema_version:Number(
          row.rights_schema_version || rightsProvenance.schema_version || 0
        ),
        rights_mode_code:String(
          row.rights_mode_code || rightsProvenance.mode_code || ''
        ),
        rights_basis:rightsBasis,
        performer_profiles:performerProfiles,
        rights_chain:rightsChain,
        rights_confirmation:rightsConfirmation,
        third_party_performers:performers,
        price_amount:amounts[index],
        final_price:amounts[index],
        a:amounts[index],
        payment_allocation:Array.isArray(row.payment_stage_allocations) && row.payment_stage_allocations.length
          ? row.payment_stage_allocations.map(function (stage) {
            return 'этап ' + String(stage.stage || '') + ': ' + String(stage.percentage || '') + '% · ' + String(stage.trigger || '');
          })
          : ['распределяется сервером по утверждённому графику платежей'],
        payment_stage_allocations:Array.isArray(row.payment_stage_allocations)
          ? row.payment_stage_allocations : [],
        cancellation_effect:'расчёт за фактически оказанное по этой позиции'
      };
    });
  }
  function rightsLineReady(line) {
    var contour = line && line.contract_contour;
    if (contour !== 'B1' && contour !== 'B2') return true;
    var b1 = contour === 'B1';
    var expectedMode = b1 ? RIGHTS_MODE_B1 : RIGHTS_MODE_B2;
    var author = line.actual_author_profile || {};
    var basis = line.rights_basis || {};
    var confirmation = line.rights_confirmation || {};
    var profiles = Array.isArray(line.performer_profiles)
      ? line.performer_profiles : [];
    if (line.rights_schema_version !== RIGHTS_SCHEMA_VERSION ||
        line.rights_mode_code !== expectedMode ||
        !String(basis.evidence_ref || '').trim() ||
        confirmation.confirmed !== true ||
        author.confirmed !== true ||
        !String(author.name || '').trim()) return false;
    if (b1) {
      return author.party_role === 'contractor' &&
        String(author.name).trim() === SPEC_EXECUTOR_NAME;
    }
    if (author.party_role !== 'third_party' ||
        String(author.name).trim() === SPEC_EXECUTOR_NAME) return false;
    var creative = profiles.filter(function (profile) {
      return profile && profile.creative === true;
    });
    if (!creative.length || !creative.some(function (profile) {
      return ['author', 'coauthor'].indexOf(profile.role_code) >= 0 &&
        String(profile.name || '').trim().toLowerCase() ===
          String(author.name || '').trim().toLowerCase();
    })) return false;
    return creative.every(function (profile) {
      return profile.consent_confirmed === true &&
        !!String(profile.consent_ref || '').trim();
    });
  }
/* Review proposal only; convert one server normalized line to admin submission. */
function specificationSubmissionLine(source) {
  const l=JSON.parse(JSON.stringify(source));
  const normalized=Array.isArray(l.deliverables)&&l.schedule&&l.corrections;
  if(!normalized)return l;
  if(l.deliverables.length!==1)throw Error('Multiple deliverables need explicit supported mapping, do not silently drop.');
  const d=l.deliverables[0];
  l.deliverable=d.name;
  l.result=d.name;
  l.formats=d.formats;
  l.acceptance_criteria=d.acceptance_criteria;
  l.inclusions=l.scope.included;
  l.exclusions=l.scope.excluded;
  l.deadline={text:l.schedule.deadline_text,date:l.schedule.deadline_date};
  l.deadline_text=l.schedule.deadline_text;
  l.deadline_date=l.schedule.deadline_date;
  l.correction_window={days:l.corrections.primary_check_days,scope:l.corrections.scope};
  l.iterations=l.corrections.voluntary_iterations;
  l.price={amount:l.price_rub,currency:'RUB'};
  l.a=l.price_amount=l.final_price=l.price_rub;
  l.discount_amount=l.discount_rub;
  // Normalized start_conditions equals dependencies except server default when empty.
  // dependency_line_ids retained, rather than turning prose into IDs.
  l.rights_confirmation=l.rights_confirmation?{confirmed:l.rights_confirmation.confirmed===true}:{};
  delete l.deliverables;delete l.schedule;delete l.corrections;
  return l;
}

  function validMutation(path,r) {
    const positive=n=>Number.isSafeInteger(n)&&n>0;
    if(path==='/admin/orders')return positive(r.id);
    if(path==='/admin/gifts')return positive(r.gift?.id)&&typeof r.gift.code==='string';
    if(path==='/admin/offers'){try{const u=new URL(r.url,'https://akademsalon.ru');return positive(r.id)&&u.origin==='https://akademsalon.ru'&&u.pathname==='/zayavka.html'&&/^#k=[A-Za-z0-9_-]+$/.test(u.hash);}catch(e){return false;}}
    if(path==='/admin/orders/flag')return Number.isSafeInteger(r.done)&&r.done>0;
    const order=path.match(/^\/admin\/orders\/(\d+)\/(price|plan|confirm_payment|pause|status|cancel|resume|archive|deliver|part_ready|final_ready|fix_ack|remind_pay|message|upload|sync_tg|handoff)(?:[/?]|$)/);
    if(order)return positive(r.order?.id)&&r.order.id===Number(order[1]);
    return true;
  }
  function pricedLines(order,total) {
    if(integer(total,{min:1})===null)throw new Error('Проверь общую цену.');
    const saved=order.specification_lines||order.specification?.lines||order.offer?.specification_lines||order.offer?.specification?.lines;
    let lines;
    if(Array.isArray(saved)&&saved.length){
      const amounts=specificationAllocation(total,saved);
      lines=saved.map((line,i)=>{const copy=specificationSubmissionLine(line);copy.a=copy.price_amount=copy.final_price=copy.price_rub=amounts[i];if(copy.price&&typeof copy.price==='object')copy.price.amount=amounts[i];return copy;});
    }else lines=specificationLinesForPrice(order,total);
    for(const line of lines){
      if(line.contract_contour==='B_PENDING')throw new Error('Для авторского заказа выбери модель прав B1 или B2 и заполни основания.');
      if(!rightsLineReady(line))throw new Error('Для авторского заказа нужны подтверждённые основания прав по каждой позиции.');
      if(line.academic_submode==='A2'&&line.author_participation?.confirmed!==true)throw new Error('Сначала зафиксируй согласованное участие клиента в исследовании.');
    }
    return lines;
  }
  return {validMutation,specificationSubmissionLine,specificationLinesForPrice,pricedLines,rightsLineReady,specificationAllocation,STATUS,ERRORS,esc,money,date,days,attention,safeLink,integer,createGateway};
});
