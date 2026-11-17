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
  '{}'::text[],
  1
from (values
  (
    'commercial',
    'sale_of_goods',
    'sale-of-goods',
    'Compra e venda de bem móvel',
    'Organize a identificação do bem, valor, pagamento e entrega combinados.',
    'Registrar os termos acordados para a compra e venda de um bem móvel.',
    '[{"key":"seller_name","label":"Nome completo do vendedor","required":true},{"key":"buyer_name","label":"Nome completo do comprador","required":true},{"key":"item_description","label":"Descrição do bem","required":true},{"key":"total_value","label":"Valor total","required":true},{"key":"payment_terms","label":"Forma e condições de pagamento","required":true},{"key":"delivery_date","label":"Data ou condição de entrega","required":true}]',
    '[{"title":"Partes","body":"Vendedor: {{seller_name}}. Comprador: {{buyer_name}}."},{"title":"Objeto","body":"O objeto deste acordo é: {{item_description}}."},{"title":"Preço e pagamento","body":"O valor total ajustado é {{total_value}}, pago conforme as seguintes condições: {{payment_terms}}."},{"title":"Entrega","body":"A entrega do bem ocorrerá em {{delivery_date}}."},{"title":"Revisão pelas partes","body":"As partes declaram que devem revisar os dados e as condições deste documento antes de assiná-lo."}]'
  ),
  (
    'services',
    'service_agreement',
    'service-agreement',
    'Prestação de serviços',
    'Descreva escopo, prazo e remuneração do serviço combinado.',
    'Registrar o escopo e as condições de um serviço acordado entre as partes.',
    '[{"key":"client_name","label":"Nome completo do contratante","required":true},{"key":"provider_name","label":"Nome completo do prestador","required":true},{"key":"service_description","label":"Descrição do serviço","required":true},{"key":"service_deadline","label":"Prazo combinado","required":true},{"key":"total_value","label":"Valor do serviço","required":true},{"key":"payment_terms","label":"Condições de pagamento","required":true}]',
    '[{"title":"Partes","body":"Contratante: {{client_name}}. Prestador: {{provider_name}}."},{"title":"Escopo do serviço","body":"O serviço acordado consiste em: {{service_description}}."},{"title":"Prazo","body":"O prazo ou cronograma combinado é: {{service_deadline}}."},{"title":"Remuneração","body":"O valor ajustado é {{total_value}}, com pagamento nas seguintes condições: {{payment_terms}}."},{"title":"Revisão pelas partes","body":"As partes devem revisar o escopo, os prazos e as condições deste documento antes de assiná-lo."}]'
  ),
  (
    'finance',
    'loan_agreement',
    'personal-loan',
    'Mútuo entre particulares',
    'Registre valor, forma de devolução e datas acordadas pelas partes.',
    'Organizar os dados de um empréstimo particular para revisão das partes.',
    '[{"key":"lender_name","label":"Nome completo do credor","required":true},{"key":"borrower_name","label":"Nome completo do devedor","required":true},{"key":"principal_amount","label":"Valor emprestado","required":true},{"key":"disbursement_date","label":"Data de disponibilização","required":true},{"key":"repayment_terms","label":"Forma e prazo de devolução","required":true}]',
    '[{"title":"Partes","body":"Credor: {{lender_name}}. Devedor: {{borrower_name}}."},{"title":"Valor","body":"O valor informado para este empréstimo é {{principal_amount}}."},{"title":"Disponibilização","body":"A disponibilização do valor foi combinada para {{disbursement_date}}."},{"title":"Devolução","body":"A devolução foi combinada nas seguintes condições: {{repayment_terms}}."},{"title":"Revisão pelas partes","body":"As partes devem revisar os valores, prazos e demais condições, buscando orientação profissional quando necessário."}]'
  ),
  (
    'other',
    'custom_agreement',
    'custom-agreement',
    'Acordo personalizado',
    'Comece descrevendo os compromissos e condições que as partes combinaram.',
    'Estruturar um acordo informado pelas partes, sujeito à revisão humana.',
    '[{"key":"first_party","label":"Nome completo da primeira parte","required":true},{"key":"second_party","label":"Nome completo da segunda parte","required":true},{"key":"agreement_subject","label":"Objeto do acordo","required":true},{"key":"terms","label":"Condições combinadas","required":true},{"key":"effective_date","label":"Data de início ou vigência","required":true}]',
    '[{"title":"Partes","body":"Primeira parte: {{first_party}}. Segunda parte: {{second_party}}."},{"title":"Objeto","body":"As partes informam que o objeto deste acordo é: {{agreement_subject}}."},{"title":"Condições","body":"As condições informadas pelas partes são: {{terms}}."},{"title":"Vigência","body":"As partes indicam como data de início ou vigência: {{effective_date}}."},{"title":"Revisão pelas partes","body":"As partes devem conferir a adequação deste texto à sua situação e buscar orientação profissional antes de formalizá-lo."}]'
  )
) as template(category_slug, type_slug, slug, name, description, purpose, fields, clauses)
join public.contract_categories category on category.slug = template.category_slug
join public.contract_types contract_type on contract_type.slug = template.type_slug
on conflict (slug, version) do nothing;

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
on conflict (template_id, version) do nothing;

insert into public.contract_clauses (slug, title, body, version, legal_references)
select
  template.slug || '-' || (clause.item ->> 'title'),
  clause.item ->> 'title',
  clause.item ->> 'body',
  1,
  '{}'::text[]
from public.contract_templates template
cross join lateral jsonb_array_elements(template.clauses) as clause(item)
on conflict (slug) do nothing;

insert into public.contract_template_clauses (template_id, clause_id, position, required)
select template.id, clause.id, clause.ordinality::integer, true
from public.contract_templates template
cross join lateral jsonb_array_elements(template.clauses) with ordinality as clause(item, ordinality)
join public.contract_clauses clause on clause.slug = template.slug || '-' || (clause.item ->> 'title')
on conflict (template_id, clause_id) do nothing;
