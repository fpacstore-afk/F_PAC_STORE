// Ready copies Apps Script Code string for Google Sheets automated webhook parsing
export const APPS_SCRIPT_PROMPT = `// CÓDIGO DE INTEGRAÇÃO BIDIRECIONAL GOOGLE SHEETS & F PAC STORE
// Cole este código inteiro no seu Google Apps Script (Extensões > Apps Script)

// 🔥 COMO ATIVAR A ATUALIZAÇÃO AUTOMÁTICA (PLANILHA ➜ SITE) SEM PRECISAR CLICAR NO MENU:
// 1. No painel esquerdo do seu Apps Script, clique no ícone de relógio (Acionadores / Triggers).
// 2. Clique no botão azul "+ Adicionar Acionador" no canto inferior direito.
// 3. Selecione a função: "syncToWebsite".
// 4. Selecione a fonte de evento: "De planilha".
// 5. Selecione o tipo de evento: "Ao alterar" (recomenda-se "Ao alterar" ou "Ao editar").
// 6. Clique em Salvar e autorize as permissões. Pronto! 🎉

// 1. Cria o menu personalizado na sua planilha ao abrir
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('F PAC Store 🔄')
    .addItem('Sincronizar Planilha ➜ Site', 'syncToWebsite')
    .addToUi();
}

// 2. Recebe dados enviados do Site e atualiza a Planilha
function doPost(e) {
  try {
    var jsonString = e.postData.contents;
    var data = JSON.parse(jsonString);
    var sheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // Create, clean and populate Tab 1: DASHBOARD
    var tabDashboard = getOrCreateSheet(sheet, "DASHBOARD");
    tabDashboard.clear();
    tabDashboard.getRange(1, 1).setValue("FATURAMENTO TOTAL COMPILADO").setFontWeight("bold");
    tabDashboard.getRange(1, 2).setValue(data.meta.totals.faturamento);
    tabDashboard.getRange(2, 1).setValue("INVESTIMENTO INICIAL TOTAL").setFontWeight("bold");
    tabDashboard.getRange(2, 2).setValue(data.meta.totals.investimentoInicial);
    tabDashboard.getRange(3, 1).setValue("LUCRO CORRENTE LÍQUIDO").setFontWeight("bold");
    tabDashboard.getRange(3, 2).setValue(data.meta.totals.lucroLiquido);
    tabDashboard.getRange(4, 1).setValue("SALDO ATUAL EM CAIXA").setFontWeight("bold");
    tabDashboard.getRange(4, 2).setValue(data.meta.totals.caixaSaldo);
    tabDashboard.getRange(5, 1).setValue("CAMPANHAS ADS (PAGAS)").setFontWeight("bold");
    tabDashboard.getRange(5, 2).setValue(data.meta.totals.adsSpent);

    // Populate Tab 2: INVESTIMENTO
    var tabInv = getOrCreateSheet(sheet, "INVESTIMENTO INICIAL");
    tabInv.clear();
    tabInv.appendRow(["ID", "Data Registro", "Descrição Gasto", "Categoria", "Valor Gasto (R$)"]);
    data.investments.forEach(function(i) {
      tabInv.appendRow([i.id, i.date, i.description, i.category, i.amount]);
    });

    // Populate Tab 3: PEDIDOS
    var tabOrds = getOrCreateSheet(sheet, "PEDIDOS");
    tabOrds.clear();
    tabOrds.appendRow(["Pedido ID", "Data Completa", "Cliente", "Método", "Total Pedido (R$)", "Status Venda", "Taxas Gateway (MP)", "COGS Fabricação", "Envio Frete", "Lucro Líquido (R$)"]);
    data.ordersList.forEach(function(o) {
      tabOrds.appendRow([o.id, o.data, o.cliente, o.metodo, o.total, o.status, o.taxa_mp, o.custo_produto, o.frete, o.lucro_liquido]);
    });

    // Populate Tab 4: CATALOGO PRODUTOS
    var tabProds = getOrCreateSheet(sheet, "PRODUTOS");
    tabProds.clear();
    tabProds.appendRow(["SKU Modelo", "Nome Técnico", "Estoque Físico", "Preço Venda (R$)", "Custo Fabricação Unitário (R$)", "Unidades Vendidas", "Faturamento Acumulado (R$)", "Lucro Acumulado (R$)", "Margem Unitária (%)"]);
    data.productsCatalog.forEach(function(p) {
      tabProds.appendRow([p.slug, p.name, p.stock, p.price, p.cost, p.soldCount, p.totalFaturamento, p.totalProfit, p.margin]);
    });

    // Fonte central de custo usada pelo cadastro de produtos. Esta aba nunca é
    // apagada na sincronização para preservar fórmulas e ajustes feitos pela equipe.
    var tabCosts = getOrCreateSheet(sheet, "CUSTOS PRODUTO");
    if (tabCosts.getLastRow() === 0) {
      tabCosts.appendRow(["ID Perfil", "Modelo Base", "Acabamento", "Linha", "Custo Produto / COGS (R$)", "Cobertura", "Componentes Pendentes", "Atualizado Em", "Ativo"]);
      tabCosts.appendRow(["oversized-premium-printed-force", "Oversized Premium 240GSM", "printed", "FORCE", 30.51, "partial", "aproveitamento/perda de DTF, mão de obra, energia, outros custos, rateio fixo, frete da embalagem", new Date(), true]);
      tabCosts.appendRow(["oversized-premium-plain-all", "Oversized Premium 240GSM", "plain", "TODOS", 29.91, "partial", "mão de obra, energia, outros custos, rateio fixo, frete da embalagem", new Date(), true]);

      // Quando o arquivo de custos auditado estiver nesta mesma planilha, o
      // COGS é derivado de suas fórmulas. Taxa do checkout e entrega ficam fora
      // daqui porque são contabilizadas separadamente no financeiro.
      if (sheet.getSheetByName("Custo por peça")) {
        tabCosts.getRange("E2").setFormula("=ROUND(SUM('Custo por peça'!B34:B36)+IF(ISNUMBER('Custo por peça'!B40),'Custo por peça'!B40,'Custo por peça'!B39)+SUM('Custo por peça'!B44,'Custo por peça'!B46:B49),2)");
        tabCosts.getRange("E3").setFormula("=ROUND(SUM('Custo por peça'!B34:B36)+SUM('Custo por peça'!B44,'Custo por peça'!B46:B49),2)");
      }
      tabCosts.getRange("F1").setNote("Use complete somente depois de preencher todos os componentes e limpar a coluna Componentes Pendentes. Caso contrário, o site mantém partial por segurança.");
      tabCosts.setFrozenRows(1);
      tabCosts.getRange(1, 1, 1, 9).setFontWeight("bold");
    }

    // Populate Tab 5: OUTRAS TRANSACOES
    var tabCf = getOrCreateSheet(sheet, "FLUXO DE CAIXA");
    tabCf.clear();
    tabCf.appendRow(["Transação ID", "Data", "Tipo Caixa", "Descrição", "Categoria", "Valor Registro (R$)"]);
    data.cashflowEntries.forEach(function(c) {
      tabCf.appendRow([c.id, c.date, c.type === 'in' ? 'Entrada (+)' : 'Saída (-)', c.description, c.category, c.amount]);
    });

    // Populate Tab 6: METRICAS TRAFEGO ADS
    var tabAds = getOrCreateSheet(sheet, "TRAFEGO PAGO");
    tabAds.clear();
    tabAds.appendRow(["Métrica ID", "Data Campanha", "Campanha Nome", "Investimento Ads (R$)", "Cliques Atribuídos", "Conversões Registradas", "ROAS Atribuído", "Lucro Estimado ads (R$)"]);
    data.trafficCampaigns.forEach(function(t) {
      tabAds.appendRow([t.id, t.date, t.campaignName, t.amountSpent, t.clicks, t.conversions, t.roas, t.lucro]);
    });

    return HtmlService.createHtmlOutput("Sincronizado de graça com a F PAC Store com sucesso!");
  } catch(err) {
    return HtmlService.createHtmlOutput("Erro na sincronização: " + err.message);
  }
}

// 3. Lê os dados editados na Planilha e envia de volta ao Site em tempo real
function syncToWebsite() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  var WEBSITE_URL = "<<WEBSITE_URL>>";
  var SYNC_SECRET = "COLE_AQUI_O_SHEETS_SYNC_SECRET";
  
  var payload = {
    costProfiles: [],
    investments: [],
    orders: [],
    products: [],
    cashflow: [],
    traffic: []
  };

  // Ler a fonte central de custos. O valor da coluna E pode ser uma fórmula;
  // getValues() envia ao site o resultado calculado mais recente.
  var tabCosts = sheet.getSheetByName("CUSTOS PRODUTO");
  if (tabCosts) {
    var costValues = tabCosts.getDataRange().getValues();
    for (var i = 1; i < costValues.length; i++) {
      var row = costValues[i];
      if (row[0] && row[1] && parseFloat(row[4]) > 0) {
        payload.costProfiles.push({
          id: String(row[0]),
          baseModel: String(row[1]),
          productFinish: String(row[2] || "all").toLowerCase(),
          collection: String(row[3] || "TODOS"),
          unitCost: parseFloat(row[4]) || 0,
          coverage: String(row[5] || "partial").toLowerCase(),
          pendingComponents: String(row[6] || ""),
          sourceLabel: "Google Sheets — CUSTOS PRODUTO",
          sourceUpdatedAt: row[7] instanceof Date ? row[7].toISOString() : String(row[7] || new Date().toISOString()),
          active: row[8] !== false && String(row[8]).toLowerCase() !== "false"
        });
      }
    }
  }

  // Ler Tab 2: INVESTIMENTO INICIAL
  var tabInv = sheet.getSheetByName("INVESTIMENTO INICIAL");
  if (tabInv) {
    var dataValues = tabInv.getDataRange().getValues();
    for (var i = 1; i < dataValues.length; i++) {
      var row = dataValues[i];
      if (row[0]) {
        payload.investments.push({
          id: String(row[0]),
          date: row[1] instanceof Date ? row[1].toISOString().split('T')[0] : String(row[1]),
          description: String(row[2]),
          category: String(row[3]),
          amount: parseFloat(row[4]) || 0
        });
      }
    }
  }

  // Ler Tab 3: PEDIDOS
  var tabOrds = sheet.getSheetByName("PEDIDOS");
  if (tabOrds) {
    var dataValues = tabOrds.getDataRange().getValues();
    for (var i = 1; i < dataValues.length; i++) {
      var row = dataValues[i];
      if (row[0]) {
        payload.orders.push({
          id: String(row[0]),
          status: String(row[5])
        });
      }
    }
  }

  // Ler Tab 4: PRODUTOS
  var tabProds = sheet.getSheetByName("PRODUTOS");
  if (tabProds) {
    var dataValues = tabProds.getDataRange().getValues();
    for (var i = 1; i < dataValues.length; i++) {
      var row = dataValues[i];
      if (row[0]) {
        payload.products.push({
          slug: String(row[0]),
          name: String(row[1]),
          stock: parseInt(row[2]) || 0,
          price: parseFloat(row[3]) || 0,
          cost: parseFloat(row[4]) || 0
        });
      }
    }
  }

  // Ler Tab 5: FLUXO DE CAIXA
  var tabCf = sheet.getSheetByName("FLUXO DE CAIXA");
  if (tabCf) {
    var dataValues = tabCf.getDataRange().getValues();
    for (var i = 1; i < dataValues.length; i++) {
      var row = dataValues[i];
      if (row[0]) {
        payload.cashflow.push({
          id: String(row[0]),
          date: row[1] instanceof Date ? row[1].toISOString().split('T')[0] : String(row[1]),
          type: String(row[2]).indexOf('+') !== -1 ? 'in' : 'out',
          description: String(row[3]),
          category: String(row[4]),
          amount: parseFloat(row[5]) || 0
        });
      }
    }
  }

  // Ler Tab 6: TRAFEGO PAGO
  var tabAds = sheet.getSheetByName("TRAFEGO PAGO");
  if (tabAds) {
    var dataValues = tabAds.getDataRange().getValues();
    for (var i = 1; i < dataValues.length; i++) {
      var row = dataValues[i];
      if (row[0]) {
        payload.traffic.push({
          id: String(row[0]),
          date: row[1] instanceof Date ? row[1].toISOString().split('T')[0] : String(row[1]),
          campaignName: String(row[2]),
          amountSpent: parseFloat(row[3]) || 0,
          clicks: parseInt(row[4]) || 0,
          conversions: parseInt(row[5]) || 0,
          roas: parseFloat(row[6]) || 0,
          lucro: parseFloat(row[7]) || 0
        });
      }
    }
  }

  var url = WEBSITE_URL + "/api/sheets/sync-back";
  var options = {
    method: "POST",
    contentType: "application/json",
    headers: { "x-sync-secret": SYNC_SECRET },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    var text = response.getContentText();
    
    if (code === 200) {
      SpreadsheetApp.getUi().alert("Sucesso! O site foi atualizado em tempo real com as alterações da sua planilha! 🎉");
    } else {
      SpreadsheetApp.getUi().alert("Erro retornado pelo site: " + text);
    }
  } catch(err) {
    SpreadsheetApp.getUi().alert("Erro ao conectar com o site: " + err.message);
  }
}

function getOrCreateSheet(spreadsheet, name) {
  var activeSheet = spreadsheet.getSheetByName(name);
  if (!activeSheet) {
    activeSheet = spreadsheet.insertSheet(name);
  }
  return activeSheet;
}
`;
