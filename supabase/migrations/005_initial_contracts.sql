-- Versioned starter templates and clauses, applied with the schema migrations.
insert into public.contract_categories (slug, name, description) values
  ('commercial', 'Comercial', 'Acordos de compra, venda e atividade comercial.'),
  ('services', 'Serviços', 'Contratos de prestação e escopo de serviços.'),
  ('finance', 'Financeiro', 'Acordos de empréstimo e obrigações financeiras.'),
  ('other', 'Outros', 'Modelos gerais e personalizados.')
on conflict (slug) do nothing;

insert into public.contract_types (category_id, slug, name, description)
select c.id, t.slug, t.name, t.description
from (values
  ('commercial', 'sale_of_goods', 'Compra e venda de bem móvel', 'Registro de condições de venda de um bem móvel.'),
  ('services', 'service_agreement', 'Prestação de serviços', 'Organize o escopo, prazo e pagamento de um serviço.'),
  ('finance', 'loan_agreement', 'Mútuo entre particulares', 'Organize informações de um empréstimo entre pessoas.'),
  ('other', 'custom_agreement', 'Acordo personalizado', 'Estruture os termos informados pelas partes.')
) as t(category_slug, slug, name, description)
join public.contract_categories c on c.slug = t.category_slug
on conflict (slug) do nothing;

insert into public.contract_templates (
  category_id, contract_type_id, category, slug, name, description, purpose, fields, clauses, legal_references, version
)
select
  category.id,
  contract_type.id,
  template.category_slug,
  template.slug,
  template.name,
  template.description,
  template.purpose,
  template.fields::jsonb,
  template.clauses::jsonb,
  template.legal_refs::text[],
  1
from (values
  (
    'commercial',
    'sale_of_goods',
    'sale-of-goods',
    'Compra e venda de bem móvel',
    'Organize identificação das partes, bem, valor, pagamento, entrega e foro.',
    'Registrar os termos acordados para a compra e venda de um bem móvel, conforme o Código Civil Brasileiro.',
    '[{"key":"seller_name","label":"Nome completo do vendedor","required":true},{"key":"seller_document","label":"CPF ou CNPJ do vendedor","required":true},{"key":"buyer_name","label":"Nome completo do comprador","required":true},{"key":"buyer_document","label":"CPF ou CNPJ do comprador","required":true},{"key":"item_description","label":"Descrição do bem (marca, modelo, ano, série ou placa, se houver)","required":true},{"key":"total_value","label":"Valor total em reais","required":true},{"key":"payment_terms","label":"Forma e condições de pagamento","required":true},{"key":"delivery_date","label":"Data ou condição de entrega","required":true},{"key":"jurisdiction","label":"Comarca do foro escolhido","required":true},{"key":"seller_address","label":"Endereço do vendedor","required":false},{"key":"buyer_address","label":"Endereço do comprador","required":false},{"key":"seller_contact","label":"E-mail ou telefone do vendedor","required":false},{"key":"buyer_contact","label":"E-mail ou telefone do comprador","required":false}]',
    '[{"title":"Partes","body":"Vendedor(a): {{seller_name}}, inscrito(a) no CPF/CNPJ sob o número {{seller_document}}. Comprador(a): {{buyer_name}}, inscrito(a) no CPF/CNPJ sob o número {{buyer_document}}."},{"title":"Objeto","body":"O objeto deste contrato é a venda do bem descrito como: {{item_description}}. O bem é vendido no estado em que se encontra, com as características informadas pelas partes, sem prejuízo da cláusula sobre vícios."},{"title":"Preço e pagamento","body":"O preço total ajustado é de {{total_value}}, pago conforme as seguintes condições: {{payment_terms}}. A quitação será dada mediante recibo, que poderá ser emitido em meio eletrônico."},{"title":"Entrega e transferência","body":"A entrega ocorrerá em {{delivery_date}}, no local e na forma acordados entre as partes. A transferência da propriedade e dos riscos sobre o bem dá-se com a tradição, salvo estipulação diversa expressamente registrada."},{"title":"Vícios e responsabilidade","body":"As partes reconhecem que o bem pode apresentar vícios aparentes ou ocultos. O(A) vendedor(a) responderá pelos vícios que tornem o bem impróprio para o uso, nos termos dos artigos 441 a 466 do Código Civil Brasileiro, cabendo ao(à) comprador(a) comunicar o problema em prazo razoável após o recebimento."},{"title":"Legislação e foro","body":"Este instrumento é regido pela lei brasileira, em especial pelos artigos 481 a 493 do Código Civil Brasileiro. Fica eleito o foro da comarca de {{jurisdiction}} para dirimir dúvidas, salvo escolha diversa expressamente acordada."},{"title":"Aceite e revisão","body":"As partes declaram ter lido e revisado este documento antes de manifestar aceite. O aceite eletrônico registrado pela plataforma é meio de evidência da manifestação de vontade e não equivale a assinatura eletrônica qualificada, nos termos da Lei nº 14.063/2020 e da Medida Provisória nº 2.200-2/2001."}]',
    ARRAY['Código Civil Brasileiro: arts. 481 a 493 (compra e venda) e 441 a 466 (vícios redibitórios)','Lei nº 13.709/2018 (LGPD)','Lei nº 14.063/2020 e Medida Provisória nº 2.200-2/2001 (assinatura eletrônica)']::text[]
  ),
  (
    'services',
    'service_agreement',
    'service-agreement',
    'Prestação de serviços',
    'Descreva partes, escopo, prazo, remuneração, responsabilidade e foro.',
    'Registrar o escopo e as condições de um serviço acordado entre as partes, conforme o Código Civil Brasileiro.',
    '[{"key":"client_name","label":"Nome completo do contratante","required":true},{"key":"client_document","label":"CPF ou CNPJ do contratante","required":true},{"key":"provider_name","label":"Nome completo do prestador","required":true},{"key":"provider_document","label":"CPF ou CNPJ do prestador","required":true},{"key":"service_description","label":"Descrição detalhada do serviço","required":true},{"key":"service_deadline","label":"Prazo ou cronograma combinado","required":true},{"key":"total_value","label":"Valor da remuneração em reais","required":true},{"key":"payment_terms","label":"Condições de pagamento","required":true},{"key":"jurisdiction","label":"Comarca do foro escolhido","required":true},{"key":"client_address","label":"Endereço do contratante","required":false},{"key":"provider_address","label":"Endereço do prestador","required":false},{"key":"client_contact","label":"E-mail ou telefone do contratante","required":false},{"key":"provider_contact","label":"E-mail ou telefone do prestador","required":false}]',
    '[{"title":"Partes","body":"Contratante: {{client_name}}, inscrito(a) no CPF/CNPJ sob o número {{client_document}}. Prestador(a): {{provider_name}}, inscrito(a) no CPF/CNPJ sob o número {{provider_document}}."},{"title":"Escopo do serviço","body":"O serviço acordado consiste em: {{service_description}}. O(A) prestador(a) executará o serviço com diligência e observância das boas práticas, nos termos dos artigos 593 a 612 do Código Civil Brasileiro."},{"title":"Prazo","body":"O prazo ou cronograma combinado é: {{service_deadline}}. Atrasos deverão ser comunicados e acordados entre as partes."},{"title":"Remuneração","body":"A remuneração ajustada é de {{total_value}}, com pagamento nas seguintes condições: {{payment_terms}}."},{"title":"Responsabilidade e confidencialidade","body":"As partes se obrigam a tratar como confidenciais as informações trocadas em razão deste serviço. O(A) prestador(a) responderá por danos decorrentes de dolo ou culpa, conforme o artigo 186 do Código Civil Brasileiro."},{"title":"Legislação e foro","body":"Este instrumento é regido pela lei brasileira. Fica eleito o foro da comarca de {{jurisdiction}} para dirimir dúvidas, salvo escolha diversa expressamente acordada."},{"title":"Aceite e revisão","body":"As partes declaram ter lido e revisado o escopo, os prazos e as condições antes de manifestar aceite. O aceite eletrônico registrado pela plataforma não equivale a assinatura eletrônica qualificada, nos termos da Lei nº 14.063/2020 e da Medida Provisória nº 2.200-2/2001."}]',
    ARRAY['Código Civil Brasileiro: arts. 593 a 612 (prestação de serviços) e 186 (responsabilidade civil)','Lei nº 13.709/2018 (LGPD)','Lei nº 14.063/2020 e Medida Provisória nº 2.200-2/2001 (assinatura eletrônica)']::text[]
  ),
  (
    'finance',
    'loan_agreement',
    'personal-loan',
    'Mútuo entre particulares',
    'Registre valor, juros, datas, devolução e foro acordados pelas partes.',
    'Organizar os dados de um empréstimo particular para revisão das partes, observando os limites legais ao mútuo.',
    '[{"key":"lender_name","label":"Nome completo do credor","required":true},{"key":"lender_document","label":"CPF ou CNPJ do credor","required":true},{"key":"borrower_name","label":"Nome completo do devedor","required":true},{"key":"borrower_document","label":"CPF ou CNPJ do devedor","required":true},{"key":"principal_amount","label":"Valor emprestado em reais","required":true},{"key":"interest_terms","label":"Juros acordados (informe zero se não houver)","required":true},{"key":"disbursement_date","label":"Data de disponibilização","required":true},{"key":"repayment_terms","label":"Forma e prazo de devolução","required":true},{"key":"jurisdiction","label":"Comarca do foro escolhido","required":true},{"key":"lender_contact","label":"E-mail ou telefone do credor","required":false},{"key":"borrower_contact","label":"E-mail ou telefone do devedor","required":false}]',
    '[{"title":"Partes","body":"Credor(a): {{lender_name}}, inscrito(a) no CPF/CNPJ sob o número {{lender_document}}. Devedor(a): {{borrower_name}}, inscrito(a) no CPF/CNPJ sob o número {{borrower_document}}."},{"title":"Valor e juros","body":"O valor informado para este empréstimo é de {{principal_amount}}. Os juros acordados são: {{interest_terms}}. As partes declaram que os encargos observam os limites legais aplicáveis ao mútuo e a vedação à usura."},{"title":"Disponibilização","body":"A disponibilização do valor foi combinada para {{disbursement_date}}, por meio a ser confirmado pelas partes."},{"title":"Devolução","body":"A devolução foi combinada nas seguintes condições: {{repayment_terms}}. A quitação deverá ser registrada por recibo ou comprovante."},{"title":"Inadimplemento","body":"O atraso no pagamento sujeitará o(a) devedor(a) aos encargos legais, sem prejuízo de negociação entre as partes, conforme os artigos 579 a 585 do Código Civil Brasileiro."},{"title":"Legislação e foro","body":"Este instrumento é regido pela lei brasileira. Fica eleito o foro da comarca de {{jurisdiction}} para dirimir dúvidas, salvo escolha diversa expressamente acordada."},{"title":"Aceite e revisão","body":"As partes devem revisar valores, prazos e encargos e buscar orientação profissional quando necessário. O aceite eletrônico registrado pela plataforma não equivale a assinatura eletrônica qualificada, nos termos da Lei nº 14.063/2020 e da Medida Provisória nº 2.200-2/2001."}]',
    ARRAY['Código Civil Brasileiro: arts. 579 a 585 (mútuo) e disposições sobre juros','Decreto nº 22.626/1933 (vedação à usura)','Lei nº 13.709/2018 (LGPD)','Lei nº 14.063/2020 e Medida Provisória nº 2.200-2/2001 (assinatura eletrônica)']::text[]
  ),
  (
    'other',
    'custom_agreement',
    'custom-agreement',
    'Acordo personalizado',
    'Comece identificando as partes, o objeto, as condições, a vigência e o foro.',
    'Estruturar um acordo informado pelas partes, sujeito à revisão humana e à lei brasileira.',
    '[{"key":"first_party","label":"Nome completo da primeira parte","required":true},{"key":"first_party_document","label":"CPF ou CNPJ da primeira parte","required":true},{"key":"second_party","label":"Nome completo da segunda parte","required":true},{"key":"second_party_document","label":"CPF ou CNPJ da segunda parte","required":true},{"key":"agreement_subject","label":"Objeto do acordo","required":true},{"key":"terms","label":"Condições combinadas","required":true},{"key":"effective_date","label":"Data de início ou vigência","required":true},{"key":"jurisdiction","label":"Comarca do foro escolhido","required":true},{"key":"first_party_contact","label":"E-mail ou telefone da primeira parte","required":false},{"key":"second_party_contact","label":"E-mail ou telefone da segunda parte","required":false}]',
    '[{"title":"Partes","body":"Primeira parte: {{first_party}}, inscrita no CPF/CNPJ sob o número {{first_party_document}}. Segunda parte: {{second_party}}, inscrita no CPF/CNPJ sob o número {{second_party_document}}."},{"title":"Objeto","body":"As partes informam que o objeto deste acordo é: {{agreement_subject}}."},{"title":"Condições","body":"As condições informadas pelas partes são: {{terms}}."},{"title":"Vigência","body":"As partes indicam como data de início ou vigência: {{effective_date}}."},{"title":"Legislação e foro","body":"Este instrumento é regido pela lei brasileira, inclusive pelas disposições gerais dos contratos do Código Civil Brasileiro. Fica eleito o foro da comarca de {{jurisdiction}} para dirimir dúvidas, salvo escolha diversa expressamente acordada."},{"title":"Aceite e revisão","body":"As partes devem conferir a adequação deste texto à sua situação e buscar orientação profissional antes de formalizá-lo. O aceite eletrônico registrado pela plataforma não equivale a assinatura eletrônica qualificada, nos termos da Lei nº 14.063/2020 e da Medida Provisória nº 2.200-2/2001."}]',
    ARRAY['Código Civil Brasileiro: disposições gerais dos contratos','Lei nº 13.709/2018 (LGPD)','Lei nº 14.063/2020 e Medida Provisória nº 2.200-2/2001 (assinatura eletrônica)']::text[]
  )
) as template(category_slug, type_slug, slug, name, description, purpose, fields, clauses, legal_refs)
join public.contract_categories category on category.slug = template.category_slug
join public.contract_types contract_type on contract_type.slug = template.type_slug
on conflict (slug, version) do update set
  name = excluded.name,
  description = excluded.description,
  purpose = excluded.purpose,
  fields = excluded.fields,
  clauses = excluded.clauses,
  legal_references = excluded.legal_references;

insert into public.contract_template_versions (template_id, version, snapshot)
select id, version, jsonb_build_object(
  'name', name,
  'description', description,
  'purpose', purpose,
  'fields', fields,
  'clauses', clauses,
  'legal_references', legal_references
)
from public.contract_templates
where version = 1
on conflict (template_id, version) do update set snapshot = excluded.snapshot;

insert into public.contract_clauses (slug, title, body, version, legal_references)
select
  template.slug || '-' || (clause.item ->> 'title'),
  clause.item ->> 'title',
  clause.item ->> 'body',
  1,
  template.legal_references
from public.contract_templates template
cross join lateral jsonb_array_elements(template.clauses) as clause(item)
on conflict (slug) do update set body = excluded.body, legal_references = excluded.legal_references;

insert into public.contract_template_clauses (template_id, clause_id, position, required)
select template.id, stored_clause.id, template_clause.ordinality::integer, true
from public.contract_templates template
cross join lateral jsonb_array_elements(template.clauses) with ordinality as template_clause(item, ordinality)
join public.contract_clauses stored_clause on stored_clause.slug = template.slug || '-' || (template_clause.item ->> 'title')
on conflict (template_id, clause_id) do nothing;
