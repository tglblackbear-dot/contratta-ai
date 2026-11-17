-- Versioned starter templates and clauses, applied with the schema migrations.
insert into public.contract_categories (slug, name, description) values
  ('commercial', 'Comercial', 'Acordos de compra, venda e atividade comercial.'),
  ('services', 'Serviços', 'Contratos de prestação e escopo de serviços.'),
  ('finance', 'Financeiro', 'Acordos de empréstimo e obrigações financeiras.'),
  ('other', 'Outros', 'Modelos gerais e personalizados.'),
  ('real_estate', 'Imobiliário', 'Locação e acordos envolvendo imóveis.')
on conflict (slug) do nothing;

insert into public.contract_types (category_id, slug, name, description)
select c.id, t.slug, t.name, t.description
from (values
  ('commercial', 'sale_of_goods', 'Compra e venda de bem móvel', 'Registro de condições de venda de um bem móvel.'),
  ('services', 'service_agreement', 'Prestação de serviços', 'Organize o escopo, prazo e pagamento de um serviço.'),
  ('finance', 'loan_agreement', 'Mútuo entre particulares', 'Organize informações de um empréstimo entre pessoas.'),
  ('other', 'custom_agreement', 'Acordo personalizado', 'Estruture os termos informados pelas partes.'),
  ('real_estate', 'rental_agreement', 'Locação de imóvel', 'Organize aluguel, prazo, depósito e obrigações das partes.'),
  ('commercial', 'equipment_rental', 'Locação de bem móvel', 'Registre locação de equipamentos, valor e devolução.'),
  ('commercial', 'confidentiality', 'Acordo de confidencialidade', 'Proteja informações compartilhadas entre as partes.'),
  ('commercial', 'partnership', 'Acordo de parceria', 'Defina contribuições, resultados e responsabilidades.'),
  ('finance', 'debt_settlement', 'Acordo de quitação de dívida', 'Registre negociação e quitação de débito.'),
  ('commercial', 'software_license', 'Licença de uso de software', 'Organize escopo, prazo e valor de uma licença.'),
  ('commercial', 'transport_agreement', 'Contrato de transporte', 'Registre coleta, entrega e responsabilidade sobre a carga.'),
  ('commercial', 'agency_agreement', 'Contrato de agência', 'Defina área de atuação, comissão e prazo do agente.'),
  ('other', 'donation_agreement', 'Doação', 'Registre a doação de bens e sua finalidade.')
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
  ),
  (
    'real_estate',
    'rental_agreement',
    'rental-agreement',
    'Locação de imóvel',
    'Organize aluguel, prazo, depósito e obrigações de locador e locatário.',
    'Registrar os termos da locação de um imóvel e as obrigações das partes.',
    '[{"key":"landlord_name","label":"Nome completo do locador","required":true},{"key":"landlord_document","label":"CPF ou CNPJ do locador","required":true},{"key":"tenant_name","label":"Nome completo do locatário","required":true},{"key":"tenant_document","label":"CPF ou CNPJ do locatário","required":true},{"key":"property_description","label":"Descrição do imóvel (endereço e características)","required":true},{"key":"rent_value","label":"Valor do aluguel em reais","required":true},{"key":"payment_day","label":"Dia de vencimento do aluguel","required":true},{"key":"lease_term","label":"Prazo da locação","required":true},{"key":"security_deposit","label":"Valor do depósito de garantia em reais","required":true},{"key":"jurisdiction","label":"Comarca do foro escolhido","required":true}]',
    '[{"title":"Partes","body":"Locador(a): {{landlord_name}}, inscrito(a) no CPF/CNPJ sob o número {{landlord_document}}. Locatário(a): {{tenant_name}}, inscrito(a) no CPF/CNPJ sob o número {{tenant_document}}."},{"title":"Objeto","body":"O imóvel locado é descrito como: {{property_description}}."},{"title":"Aluguel","body":"O aluguel mensal é de {{rent_value}}, com vencimento todo dia {{payment_day}}."},{"title":"Prazo","body":"A locação vigorará pelo prazo de {{lease_term}}, podendo ser renovada mediante acordo escrito."},{"title":"Depósito de garantia","body":"O locatário entregará depósito de garantia no valor de {{security_deposit}}, que será restituído ao final da locação, descontados débitos comprovados."},{"title":"Obrigações das partes","body":"O locador entregará o imóvel em condições de uso e o locatário o utilizará com cuidado, pagando aluguel e encargos em dia, conforme a Lei nº 8.245/1991."},{"title":"Legislação e foro","body":"Este instrumento é regido pela Lei nº 8.245/1991 e pelo Código Civil Brasileiro. Fica eleito o foro da comarca de {{jurisdiction}} para dirimir dúvidas."},{"title":"Aceite e revisão","body":"As partes declaram ter lido e revisado este contrato. O aceite eletrônico registrado pela plataforma não equivale a assinatura eletrônica qualificada, nos termos da Lei nº 14.063/2020 e da Medida Provisória nº 2.200-2/2001."}]',
    ARRAY['Lei nº 8.245/1991 (locação de imóveis)','Código Civil Brasileiro: arts. 421 e 422','Lei nº 13.709/2018 (LGPD)','Lei nº 14.063/2020 e Medida Provisória nº 2.200-2/2001 (assinatura eletrônica)']::text[]
  ),
  (
    'commercial',
    'equipment_rental',
    'equipment-rental',
    'Locação de bem móvel',
    'Registre locação de equipamentos, valor, prazo e devolução.',
    'Organizar a locação de um bem móvel entre locador e locatário.',
    '[{"key":"lessor_name","label":"Nome completo do locador","required":true},{"key":"lessor_document","label":"CPF ou CNPJ do locador","required":true},{"key":"lessee_name","label":"Nome completo do locatário","required":true},{"key":"lessee_document","label":"CPF ou CNPJ do locatário","required":true},{"key":"equipment_description","label":"Descrição do equipamento (marca, modelo, série)","required":true},{"key":"rental_value","label":"Valor da locação em reais","required":true},{"key":"rental_period","label":"Período da locação","required":true},{"key":"jurisdiction","label":"Comarca do foro escolhido","required":true}]',
    '[{"title":"Partes","body":"Locador(a): {{lessor_name}}, inscrito(a) no CPF/CNPJ sob o número {{lessor_document}}. Locatário(a): {{lessee_name}}, inscrito(a) no CPF/CNPJ sob o número {{lessee_document}}."},{"title":"Objeto","body":"O equipamento locado é descrito como: {{equipment_description}}."},{"title":"Valor","body":"O valor da locação é de {{rental_value}}, pago conforme acordo entre as partes."},{"title":"Prazo","body":"A locação vigorará durante {{rental_period}}."},{"title":"Conservação e devolução","body":"O locatário deverá conservar o bem e devolvê-lo nas mesmas condições em que recebeu, salvo desgaste natural, conforme os artigos 565 a 578 do Código Civil Brasileiro."},{"title":"Legislação e foro","body":"Este instrumento é regido pela lei brasileira. Fica eleito o foro da comarca de {{jurisdiction}} para dirimir dúvidas."},{"title":"Aceite e revisão","body":"As partes devem revisar os dados antes de manifestar aceite. O aceite eletrônico registrado pela plataforma não equivale a assinatura eletrônica qualificada."}]',
    ARRAY['Código Civil Brasileiro: arts. 565 a 578 (locação de coisas)','Lei nº 14.063/2020 e Medida Provisória nº 2.200-2/2001 (assinatura eletrônica)']::text[]
  ),
  (
    'commercial',
    'confidentiality',
    'confidentiality',
    'Acordo de confidencialidade',
    'Defina quais informações são confidenciais e por quanto tempo.',
    'Proteger informações confidenciais compartilhadas entre as partes.',
    '[{"key":"party_a_name","label":"Nome completo da primeira parte","required":true},{"key":"party_a_document","label":"CPF ou CNPJ da primeira parte","required":true},{"key":"party_b_name","label":"Nome completo da segunda parte","required":true},{"key":"party_b_document","label":"CPF ou CNPJ da segunda parte","required":true},{"key":"confidential_info","label":"Descrição das informações confidenciais","required":true},{"key":"purpose","label":"Finalidade do compartilhamento","required":true},{"key":"term_months","label":"Prazo de confidencialidade em meses","required":true},{"key":"jurisdiction","label":"Comarca do foro escolhido","required":true}]',
    '[{"title":"Partes","body":"Primeira parte: {{party_a_name}}, inscrita no CPF/CNPJ sob o número {{party_a_document}}. Segunda parte: {{party_b_name}}, inscrita no CPF/CNPJ sob o número {{party_b_document}}."},{"title":"Informação confidencial","body":"São consideradas confidenciais as seguintes informações: {{confidential_info}}."},{"title":"Finalidade","body":"As informações poderão ser usadas apenas para: {{purpose}}."},{"title":"Prazo","body":"A obrigação de confidencialidade vigorará por {{term_months}} meses contados da data deste acordo."},{"title":"Obrigações","body":"As partes se obrigam a não divulgar, copiar ou usar as informações para fins diversos da finalidade informada, adotando cuidados razoáveis de segurança."},{"title":"Devolução","body":"A pedido da parte divulgadora, a outra parte devolverá ou descartará o material recebido, salvo obrigação legal de conservação."},{"title":"Legislação e foro","body":"Este acordo é regido pelo Código Civil Brasileiro e pela Lei nº 13.709/2018 (LGPD). Fica eleito o foro da comarca de {{jurisdiction}}."},{"title":"Aceite e revisão","body":"As partes devem revisar este acordo antes de manifestar aceite. O aceite eletrônico não equivale a assinatura eletrônica qualificada."}]',
    ARRAY['Código Civil Brasileiro: arts. 421 e 422 (boa-fé e função social)','Lei nº 13.709/2018 (LGPD)','Lei nº 14.063/2020 e Medida Provisória nº 2.200-2/2001 (assinatura eletrônica)']::text[]
  ),
  (
    'commercial',
    'partnership',
    'partnership',
    'Acordo de parceria',
    'Defina contribuições, divisão de resultados e responsabilidades.',
    'Registrar uma parceria entre pessoas ou empresas para determinado objetivo.',
    '[{"key":"partner_a_name","label":"Nome completo do primeiro parceiro","required":true},{"key":"partner_a_document","label":"CPF ou CNPJ do primeiro parceiro","required":true},{"key":"partner_b_name","label":"Nome completo do segundo parceiro","required":true},{"key":"partner_b_document","label":"CPF ou CNPJ do segundo parceiro","required":true},{"key":"partnership_object","label":"Objeto da parceria","required":true},{"key":"contributions","label":"Contribuições de cada parte","required":true},{"key":"profit_split","label":"Forma de divisão dos resultados","required":true},{"key":"term","label":"Prazo da parceria","required":true},{"key":"jurisdiction","label":"Comarca do foro escolhido","required":true}]',
    '[{"title":"Partes","body":"Primeiro parceiro: {{partner_a_name}}, inscrito no CPF/CNPJ sob o número {{partner_a_document}}. Segundo parceiro: {{partner_b_name}}, inscrito no CPF/CNPJ sob o número {{partner_b_document}}."},{"title":"Objeto","body":"A parceria tem por objeto: {{partnership_object}}."},{"title":"Contribuições","body":"As contribuições de cada parte são: {{contributions}}."},{"title":"Resultados","body":"Os resultados serão divididos conforme: {{profit_split}}."},{"title":"Prazo","body":"A parceria vigorará pelo prazo de {{term}}."},{"title":"Responsabilidade","body":"Cada parte responderá por suas próprias obrigações, observando a boa-fé objetiva e a função social do contrato, nos termos dos artigos 421 e 422 do Código Civil Brasileiro."},{"title":"Legislação e foro","body":"Este acordo é regido pela lei brasileira. Fica eleito o foro da comarca de {{jurisdiction}}."},{"title":"Aceite e revisão","body":"As partes devem revisar os termos antes de formalizar a parceria. O aceite eletrônico não equivale a assinatura eletrônica qualificada."}]',
    ARRAY['Código Civil Brasileiro: arts. 421 e 422 e disposições gerais dos contratos','Lei nº 14.063/2020 e Medida Provisória nº 2.200-2/2001 (assinatura eletrônica)']::text[]
  ),
  (
    'finance',
    'debt_settlement',
    'debt-settlement',
    'Acordo de quitação de dívida',
    'Registre negociação, valor e condições de quitação de débito.',
    'Organizar acordo entre credor e devedor para quitação de dívida.',
    '[{"key":"creditor_name","label":"Nome completo do credor","required":true},{"key":"creditor_document","label":"CPF ou CNPJ do credor","required":true},{"key":"debtor_name","label":"Nome completo do devedor","required":true},{"key":"debtor_document","label":"CPF ou CNPJ do devedor","required":true},{"key":"debt_description","label":"Descrição da dívida (origem e valor original)","required":true},{"key":"settlement_amount","label":"Valor acordado para quitação em reais","required":true},{"key":"payment_terms","label":"Forma e prazo de pagamento","required":true},{"key":"jurisdiction","label":"Comarca do foro escolhido","required":true}]',
    '[{"title":"Partes","body":"Credor(a): {{creditor_name}}, inscrito(a) no CPF/CNPJ sob o número {{creditor_document}}. Devedor(a): {{debtor_name}}, inscrito(a) no CPF/CNPJ sob o número {{debtor_document}}."},{"title":"Dívida","body":"A dívida objeto deste acordo é descrita como: {{debt_description}}."},{"title":"Valor acordado","body":"As partes acordam o valor de {{settlement_amount}} para quitação da dívida."},{"title":"Pagamento","body":"O pagamento será feito conforme: {{payment_terms}}."},{"title":"Quitação","body":"Após o pagamento integral do valor acordado, o credor dará plena quitação ao devedor, nos termos dos artigos 319 e 320 do Código Civil Brasileiro."},{"title":"Transação","body":"Este acordo tem natureza de transação, conforme os artigos 840 a 850 do Código Civil Brasileiro, buscando encerrar a controvérsia entre as partes."},{"title":"Legislação e foro","body":"Fica eleito o foro da comarca de {{jurisdiction}} para dirimir dúvidas."},{"title":"Aceite e revisão","body":"As partes devem revisar os valores antes de manifestar aceite. O aceite eletrônico não equivale a assinatura eletrônica qualificada."}]',
    ARRAY['Código Civil Brasileiro: arts. 319, 320 e 840 a 850 (quitação e transação)','Lei nº 14.063/2020 e Medida Provisória nº 2.200-2/2001 (assinatura eletrônica)']::text[]
  ),
  (
    'commercial',
    'software_license',
    'software-license',
    'Licença de uso de software',
    'Defina escopo, prazo e valor de uma licença de software.',
    'Registrar os termos de licenciamento de uso de software.',
    '[{"key":"licensor_name","label":"Nome completo do licenciador","required":true},{"key":"licensor_document","label":"CPF ou CNPJ do licenciador","required":true},{"key":"licensee_name","label":"Nome completo do licenciado","required":true},{"key":"licensee_document","label":"CPF ou CNPJ do licenciado","required":true},{"key":"software_description","label":"Descrição do software","required":true},{"key":"license_scope","label":"Escopo de uso autorizado","required":true},{"key":"license_value","label":"Valor da licença em reais","required":true},{"key":"license_term","label":"Prazo da licença","required":true},{"key":"jurisdiction","label":"Comarca do foro escolhido","required":true}]',
    '[{"title":"Partes","body":"Licenciador(a): {{licensor_name}}, inscrito(a) no CPF/CNPJ sob o número {{licensor_document}}. Licenciado(a): {{licensee_name}}, inscrito(a) no CPF/CNPJ sob o número {{licensee_document}}."},{"title":"Objeto","body":"O software licenciado é descrito como: {{software_description}}."},{"title":"Escopo de uso","body":"O uso autorizado é: {{license_scope}}. É vedado usar o software fora desse escopo."},{"title":"Valor","body":"O valor da licença é de {{license_value}}, pago conforme acordo entre as partes."},{"title":"Prazo","body":"A licença vigorará pelo prazo de {{license_term}}."},{"title":"Propriedade intelectual","body":"A propriedade do software permanece com o licenciador, conforme a Lei nº 9.609/1998. Esta licença não transfere titularidade."},{"title":"Responsabilidade","body":"O licenciado utilizará o software de forma lícita e o licenciador responderá pela conformidade do produto com a descrição informada."},{"title":"Legislação e foro","body":"Fica eleito o foro da comarca de {{jurisdiction}} para dirimir dúvidas."},{"title":"Aceite e revisão","body":"As partes devem revisar os termos antes de manifestar aceite. O aceite eletrônico não equivale a assinatura eletrônica qualificada."}]',
    ARRAY['Lei nº 9.609/1998 (propriedade intelectual de software)','Código Civil Brasileiro: disposições gerais dos contratos','Lei nº 14.063/2020 e Medida Provisória nº 2.200-2/2001 (assinatura eletrônica)']::text[]
  ),
  (
    'commercial',
    'transport_agreement',
    'transport-agreement',
    'Contrato de transporte',
    'Registre coleta, entrega, valor e responsabilidade sobre a carga.',
    'Organizar a contratação de transporte de bens ou cargas.',
    '[{"key":"carrier_name","label":"Nome completo do transportador","required":true},{"key":"carrier_document","label":"CPF ou CNPJ do transportador","required":true},{"key":"shipper_name","label":"Nome completo do contratante do transporte","required":true},{"key":"shipper_document","label":"CPF ou CNPJ do contratante","required":true},{"key":"cargo_description","label":"Descrição da carga","required":true},{"key":"origin","label":"Local de coleta","required":true},{"key":"destination","label":"Local de entrega","required":true},{"key":"transport_value","label":"Valor do transporte em reais","required":true},{"key":"delivery_deadline","label":"Prazo de entrega","required":true},{"key":"jurisdiction","label":"Comarca do foro escolhido","required":true}]',
    '[{"title":"Partes","body":"Transportador(a): {{carrier_name}}, inscrito(a) no CPF/CNPJ sob o número {{carrier_document}}. Contratante: {{shipper_name}}, inscrito(a) no CPF/CNPJ sob o número {{shipper_document}}."},{"title":"Objeto","body":"A carga a ser transportada é descrita como: {{cargo_description}}."},{"title":"Coleta e entrega","body":"A coleta ocorrerá em {{origin}} e a entrega em {{destination}}."},{"title":"Valor","body":"O valor do transporte é de {{transport_value}}, pago conforme acordo entre as partes."},{"title":"Prazo","body":"A entrega deverá ocorrer até {{delivery_deadline}}."},{"title":"Responsabilidade","body":"O transportador responderá pela entrega da carga nas condições recebidas, nos termos dos artigos 730 a 756 do Código Civil Brasileiro, salvo causa excludente de responsabilidade."},{"title":"Legislação e foro","body":"Fica eleito o foro da comarca de {{jurisdiction}} para dirimir dúvidas."},{"title":"Aceite e revisão","body":"As partes devem revisar os dados antes de manifestar aceite. O aceite eletrônico não equivale a assinatura eletrônica qualificada."}]',
    ARRAY['Código Civil Brasileiro: arts. 730 a 756 (contrato de transporte)','Lei nº 14.063/2020 e Medida Provisória nº 2.200-2/2001 (assinatura eletrônica)']::text[]
  ),
  (
    'commercial',
    'agency_agreement',
    'agency-agreement',
    'Contrato de agência',
    'Defina área de atuação, comissão e prazo do agente.',
    'Registrar a atuação de agente em nome de uma empresa.',
    '[{"key":"principal_name","label":"Nome completo do principal","required":true},{"key":"principal_document","label":"CPF ou CNPJ do principal","required":true},{"key":"agent_name","label":"Nome completo do agente","required":true},{"key":"agent_document","label":"CPF ou CNPJ do agente","required":true},{"key":"agency_object","label":"Objeto da agência","required":true},{"key":"territory","label":"Área ou território de atuação","required":true},{"key":"commission","label":"Forma de cálculo da comissão","required":true},{"key":"term","label":"Prazo do contrato","required":true},{"key":"jurisdiction","label":"Comarca do foro escolhido","required":true}]',
    '[{"title":"Partes","body":"Principal: {{principal_name}}, inscrito no CPF/CNPJ sob o número {{principal_document}}. Agente: {{agent_name}}, inscrito no CPF/CNPJ sob o número {{agent_document}}."},{"title":"Objeto","body":"O agente atuará na promoção e intermediação de negócios referentes a: {{agency_object}}."},{"title":"Área de atuação","body":"A atuação ocorrerá em: {{territory}}."},{"title":"Comissão","body":"A comissão será calculada conforme: {{commission}}."},{"title":"Prazo","body":"Este contrato vigorará pelo prazo de {{term}}."},{"title":"Obrigações","body":"O agente agirá com lealdade e diligência, observando a Lei nº 4.886/1965 e suas alterações."},{"title":"Rescisão","body":"A rescisão seguirá o disposto na legislação aplicável e as condições acordadas entre as partes."},{"title":"Legislação e foro","body":"Fica eleito o foro da comarca de {{jurisdiction}} para dirimir dúvidas."},{"title":"Aceite e revisão","body":"As partes devem revisar os termos antes de manifestar aceite. O aceite eletrônico não equivale a assinatura eletrônica qualificada."}]',
    ARRAY['Lei nº 4.886/1965 e alterações (contrato de agência)','Lei nº 14.063/2020 e Medida Provisória nº 2.200-2/2001 (assinatura eletrônica)']::text[]
  ),
  (
    'other',
    'donation_agreement',
    'donation-agreement',
    'Doação',
    'Registre a doação de um bem e sua finalidade.',
    'Registrar a transferência gratuita de um bem a outra pessoa.',
    '[{"key":"donor_name","label":"Nome completo do doador","required":true},{"key":"donor_document","label":"CPF ou CNPJ do doador","required":true},{"key":"donee_name","label":"Nome completo do donatário","required":true},{"key":"donee_document","label":"CPF ou CNPJ do donatário","required":true},{"key":"donated_asset","label":"Descrição do bem doado","required":true},{"key":"donation_purpose","label":"Finalidade ou encargo da doação","required":true},{"key":"donation_date","label":"Data da doação","required":true},{"key":"jurisdiction","label":"Comarca do foro escolhido","required":true}]',
    '[{"title":"Partes","body":"Doador(a): {{donor_name}}, inscrito(a) no CPF/CNPJ sob o número {{donor_document}}. Donatário(a): {{donee_name}}, inscrito(a) no CPF/CNPJ sob o número {{donee_document}}."},{"title":"Objeto","body":"O bem doado é descrito como: {{donated_asset}}."},{"title":"Finalidade","body":"A doação é destinada a: {{donation_purpose}}. Tratando-se de doação com encargo, o donatário deverá cumpri-lo, conforme o Código Civil Brasileiro."},{"title":"Entrega","body":"A entrega do bem ocorrerá em {{donation_date}}, com transferência de posse ao donatário."},{"title":"Legislação e foro","body":"Esta doação é regida pelos artigos 538 a 556 do Código Civil Brasileiro. Fica eleito o foro da comarca de {{jurisdiction}}."},{"title":"Aceite e revisão","body":"As partes declaram ter lido e revisado este documento. O aceite eletrônico registrado pela plataforma não equivale a assinatura eletrônica qualificada."}]',
    ARRAY['Código Civil Brasileiro: arts. 538 a 556 (doação)','Lei nº 14.063/2020 e Medida Provisória nº 2.200-2/2001 (assinatura eletrônica)']::text[]
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
