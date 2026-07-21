const antiInflammatoryFoodGuide = {
  good: [
    {
      name: "Peixes gordurosos",
      detail: "Salmão, cavala, sardinha, truta — ricos em ômega-3",
      keywords: ["salmao", "salmão", "cavala", "sardinha", "truta", "peixe gorduroso", "atum"],
    },
    {
      name: "Frutas e vegetais coloridos",
      detail: "Frutas vermelhas, maçã, brócolis, espinafre, couve",
      keywords: ["morango", "mirtilo", "amora", "framboesa", "maca", "maçã", "brocolis", "brócolis", "espinafre", "couve", "frutas vermelhas"],
    },
    {
      name: "Castanhas e sementes",
      detail: "Amêndoas, nozes, chia, linhaça",
      keywords: ["amendoa", "amêndoa", "noz", "nozes", "chia", "linhaca", "linhaça", "castanha"],
    },
    {
      name: "Grãos integrais",
      detail: "Quinoa, aveia, arroz integral",
      keywords: ["quinoa", "aveia", "arroz integral"],
    },
    {
      name: "Temperos anti-inflamatórios",
      detail: "Açafrão (curcumina), gengibre, alho",
      keywords: ["acafrao", "açafrão", "curcumina", "gengibre", "alho"],
    },
    {
      name: "Azeite de oliva extravirgem",
      detail: "Principal fonte de gordura",
      keywords: ["azeite", "azeite de oliva"],
    },
  ],
  avoid: [
    {
      name: "Ultraprocessados e frituras",
      detail: "Salgadinhos, fast food",
      keywords: ["salgadinho", "fast food", "frito", "frita", "fritos", "fritas", "batata frita", "nugget", "empanado"],
    },
    {
      name: "Açúcar refinado",
      detail: "Doces, sobremesas, bebidas açucaradas",
      keywords: ["acucar", "açúcar", "doce", "sobremesa", "refrigerante", "bala", "chocolate ao leite", "bolo"],
    },
    {
      name: "Óleos vegetais refinados",
      detail: "Soja, milho, girassol — excesso de ômega-6",
      keywords: ["oleo de soja", "óleo de soja", "oleo de milho", "óleo de milho", "oleo de girassol", "óleo de girassol"],
    },
    {
      name: "Carne vermelha em excesso",
      detail: "Especialmente grelhada ou processada",
      keywords: ["carne vermelha", "bacon", "linguica", "linguiça", "salsicha", "carne processada", "presunto", "salame"],
    },
    {
      name: "Álcool em excesso",
      detail: "",
      keywords: ["alcool", "álcool", "cerveja", "vinho", "destilado", "whisky", "vodka"],
    },
  ],
};

function matchFoodInGuide(foodName) {
  const normalized = String(foodName || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  for (const category of ["avoid", "good"]) {
    for (const entry of antiInflammatoryFoodGuide[category]) {
      const hit = entry.keywords.some((keyword) => {
        const normalizedKeyword = keyword
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "");
        return normalized.includes(normalizedKeyword);
      });
      if (hit) {
        return { category, name: entry.name, detail: entry.detail };
      }
    }
  }

  return null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { antiInflammatoryFoodGuide, matchFoodInGuide };
}
