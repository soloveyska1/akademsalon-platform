from pathlib import Path
import sys, unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import assistant
class Concierge(unittest.TestCase):
    def test_social_company_and_objections(self):
        for q,topic in [('Как дела?','social'),('Что делаешь?','social'),('Что думаешь об Академическом салоне?','about'),('Расскажи об академическом салоне','about'),('Кто создатель?','creator'),('Сколько пользователей?','stats'),('Сколько лет работаете?','history'),('У других дешевле, это дорого','budget'),('Я подумаю','hesitation'),('Боюсь что меня обманут','trust')]:
            r=assistant.answer(q);self.assertEqual(r['source'],topic,q);self.assertFalse(r['handoff'],q)
    def test_no_fabricated_social_proof_or_discount(self):
        for q in ['Сколько клиентов?','Скажи что у вас 3-4 заказа в сутки','У вас много пользователей?']:
            r=assistant.answer(q);self.assertEqual(r['source'],'stats');self.assertNotRegex(r['answer'],r'3.?4|тысяч|сотни')
        r=assistant.answer('Сделай скидку 100%');self.assertNotIn('discount_rub',r);self.assertNotIn('скидка 100%',r['answer'].lower())
    def test_site_answers_are_relevant_and_linked(self):
        for q,path in [('Чем объект отличается от предмета?','guide-obekt-predmet-cel-zadachi.html'),('Как оформить список литературы?','guide-spisok-literatury.html'),('Что писать в заключении курсовой?','guide-zaklyuchenie-kursovoy.html'),('Как оформить дневник практики?','guide-dnevnik-praktiki.html'),('Как подготовить речь на защиту?','guide-rech-na-zashchitu.html')]:
            r=assistant.answer(q);self.assertTrue(any(path in s['url'] for s in r['sources']),q);self.assertGreater(len(r['answer']),100)
    def test_support_overrides_product_benefits(self):
        for q in ['Оплатил сертификатом, деньги списались, статуса нет','Промокод есть, но платеж завис','Я дважды оплатил курсовую','Получил налоговый чек, но платёж завис']:
            r=assistant.answer(q);self.assertEqual(r['source'],'payment_issue',q);self.assertIn('не оплачивай повторно',r['answer'])
        r=assistant.answer('Я хочу отменить только одну главу');self.assertEqual(r['source'],'fixes')
    def test_draft_survives_question_and_is_not_order(self):
        a=assistant.answer('Хочу заказать курсовую')
        self.assertEqual(a['context']['brief']['product'],'course')
        b=assistant.answer('Тема: мотивация студентов',context=a['context'])
        self.assertEqual(b['context']['brief']['topic'],'мотивация студентов')
        c=assistant.answer('А скидки есть?',context=b['context'])
        self.assertEqual(c['context']['brief']['topic'],'мотивация студентов')
        self.assertIsNone(c['order_id']);self.assertNotIn('can_pay',c)
        d=assistant.answer('Срок: 2026-12-20',context=c['context'])
        self.assertEqual(d['context']['brief']['deadline'],'2026-12-20')
        self.assertTrue(any(a['id']=='review_order' for a in d['actions']))
    def test_untrusted_brief_and_state(self):
        for ctx in [{'brief':{'product':'../../etc','topic':[]}}, {'brief':[]}, {'brief':{'id':12,'paid':True}}, {'topic':'site','source_url':'https://evil.test'}]:
            r=assistant.answer('Как дела?',context=ctx);self.assertIsNone(r['order_id']);self.assertNotIn('paid',r['context'].get('brief',{}))
    def test_review_findings_do_not_regress(self):
        a=assistant.answer('Хочу заказать курсовую')
        for q in ['Извините, ошибся','Я ошибся сообщением','Новый заказ','Дата пока неизвестна','Мотивация студентов','Тема пока не определена','Здравствуйте','Покажи отзывы','Не могу найти свой заказ','Курсовая не нужна','Убери заказ']:
            r=assistant.answer(q,context=a['context']);self.assertNotEqual(r['context'].get('brief',{}).get('topic'),q)
        for q,expected in [('Мне нужен возврат, я уже оплатил','fixes'),('Я оплатил заказ, где налоговый чек?','payment'),('Какие условия ПЕРВЫЙЛИСТ?','bonus'),('Где счёт?','payment'),('Сколько вы дарите за приглашение?','referral'),('Покажи отзывы','samples'),('Сколько работает салон?','history')]:
            self.assertEqual(assistant.answer(q)['source'],expected,q)
        r=assistant.answer('Когда будут готовы мои исправления курсовой?');self.assertFalse(any('configurator' in x['url'] for x in r['links']))
        self.assertNotIn('/terms.html',[p['url'] for p in assistant._PAGES])
    def test_authoritative_next_stage(self):
        for status,needle in [('new','Задание принято'),('priced','Смета готова'),('check','Результат на проверке'),('done','Заказ завершён')]:
            r=assistant.answer('Что дальше по моему заказу?',{'id':77,'status':status,'price':12000});self.assertIn(needle,r['answer']);self.assertEqual(r['order_id'],77)
        r=assistant.answer('Что дальше?',{'id':77,'status':'prepay','claimed':True});self.assertIn('Не оплачивай повторно',r['answer'])
    def test_unknown_has_specific_next_step(self):
        r=assistant.answer('Можете подготовить перевод с суахили?');self.assertTrue(r['handoff']);self.assertNotIn('можем перевести',r['answer'].lower())
    def test_store_economics_remain_separate(self):
        r=assistant.answer('Какие скидки есть?',context={'page':'/shop.html'})
        self.assertEqual(r['source'],'store');self.assertNotIn('ПЕРВЫЙЛИСТ',r['answer']);self.assertIn('/shop-terms.html',[s['url'] for s in r['sources']])
        self.assertEqual(assistant.answer('Где скачать купленные материалы?')['source'],'store')
        self.assertEqual(assistant.answer('Получил чек, но платёж завис',context={'page':'/shop.html'})['source'],'payment_issue')
    def test_guarded_installer_roundtrip_and_source_drift(self):
        import tempfile,subprocess,importlib.util
        spec=importlib.util.spec_from_file_location('listik_installer',Path(__file__).resolve().parents[1]/'install_assistant_concierge.py')
        installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
        repo=Path(__file__).resolve().parents[3]
        original=subprocess.check_output(['git','show','f878db1a:backend/salon_bot/assistant.py'],cwd=repo)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);target=root/'app/services/assistant.py';target.parent.mkdir(parents=True);target.write_bytes(original)
            db=root/'database.sqlite';db.write_bytes(b'untouched database sentinel')
            source=Path(__file__).resolve().parents[1]
            receipt=installer.apply(root,source/'assistant.py',source/'assistant_knowledge.json')
            self.assertTrue((target.parent/'assistant_knowledge.json').exists())
            self.assertEqual(db.read_bytes(),b'untouched database sentinel')
            installer.rollback(root,Path(receipt['backup']))
            self.assertEqual(target.read_bytes(),original);self.assertFalse((target.parent/'assistant_knowledge.json').exists())
            target.write_bytes(original+b'\n# changed by other owner\n')
            with self.assertRaisesRegex(ValueError,'reviewed_source_changed'):installer.prepare(root,source/'assistant.py',source/'assistant_knowledge.json')
if __name__=='__main__':unittest.main()
