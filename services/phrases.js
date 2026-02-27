export const PHRASES = {
  // 🔹 Début de conversation
  intro: {
    buyer: [
      "Parfait, commençons.",
      "Très bien, regardons cela ensemble.",
      "D’accord, je vais vous poser quelques questions.",
      "Super, faisons le point.",
      "Très bien, avançons étape par étape.",
      "Parfait, je m’en occupe.",
      "Bien, commençons par préciser votre recherche.",
      "Très bien, je vais vous guider.",
      "Parfait, voyons cela ensemble.",
      "Excellent, commençons."
    ],
    seller: [
      "Parfait, commençons la mise en vente de votre bien.",
      "Très bien, regardons votre bien ensemble.",
      "D’accord, je vais vous poser quelques questions sur votre bien.",
      "Super, faisons le point sur votre logement.",
      "Très bien, avançons étape par étape pour la vente.",
      "Parfait, je m’occupe de noter votre bien.",
      "Bien, commençons par préciser les détails de votre bien.",
      "Très bien, je vais vous guider pour la mise en vente.",
      "Parfait, voyons votre bien ensemble.",
      "Excellent, commençons la description de votre bien."
    ]
  },

  // ❓ QUESTIONS
  questions: {
    type: {
      buyer: [
        "Quel type de bien recherchez-vous ?",
        "S’agit-il d’une maison ou d’un appartement ?",
        "Quel type de logement souhaitez-vous ?",
        "Vous cherchez plutôt une maison ou un appartement ?",
        "Quel genre de bien vous intéresse ?",
        "Quel type de logement ciblez-vous ?",
        "Parlons du type de bien : maison ou appartement ?",
        "Quel est le type de bien recherché ?",
        "Pouvez-vous préciser le type de logement ?",
        "Maison ou appartement ?"
      ],
      seller: [
        "Quel type de bien souhaitez-vous vendre ?",
        "Est-ce une maison ou un appartement ?",
        "Quel type de logement mettez-vous en vente ?",
        "Votre bien est-il une maison ou un appartement ?",
        "Pouvez-vous préciser le type de bien ?",
        "Quel genre de logement vendez-vous ?",
        "Parlons du type de bien à vendre : maison ou appartement ?",
        "Quel type de logement est proposé ?",
        "Maison ou appartement à vendre ?",
        "Pouvez-vous indiquer le type de votre bien ?"
      ]
    },

    ville: {
      buyer: [
        "Dans quelle ville souhaitez-vous acheter ?",
        "Quelle est la ville recherchée ?",
        "Où souhaitez-vous vous installer ?",
        "Quelle ville vous intéresse ?",
        "Pouvez-vous préciser la localisation ?",
        "Dans quelle ville se situe votre projet ?",
        "Quelle est la ville de votre futur logement ?",
        "Pour la localisation, quelle ville visez-vous ?",
        "Pouvez-vous m’indiquer la ville ?",
        "Dans quelle zone souhaitez-vous acheter ?"
      ],
      seller: [
        "Dans quelle ville se situe votre bien ?",
        "Quelle est la localisation de votre bien ?",
        "Pouvez-vous indiquer la ville du logement à vendre ?",
        "Votre bien est-il situé dans quelle ville ?",
        "Dans quelle zone se trouve votre bien ?",
        "Pouvez-vous préciser la ville du logement ?",
        "Où se situe votre bien ?",
        "Quelle est la ville de votre logement ?",
        "Pour la vente, quelle ville concerne votre bien ?",
        "Indiquez-moi la localisation exacte de votre bien."
      ]
    },

    budget: {
      buyer: [
        "Quel est votre budget ?",
        "Quel budget souhaitez-vous consacrer à cet achat ?",
        "Quel est le montant maximal envisagé ?",
        "Combien souhaitez-vous investir ?",
        "Quel budget avez-vous en tête ?",
        "Pouvez-vous me donner votre budget ?",
        "Quel est votre budget maximum ?",
        "Quel montant prévoyez-vous pour ce bien ?",
        "Quel est votre budget approximatif ?",
        "Quel budget ciblez-vous ?"
      ],
      seller: [
        "À quel prix souhaitez-vous vendre votre bien ?",
        "Quel est le prix de vente envisagé ?",
        "Pouvez-vous indiquer votre prix souhaité ?",
        "Quel prix ciblez-vous pour ce logement ?",
        "Quel est le montant demandé pour votre bien ?",
        "À combien estimez-vous votre logement ?",
        "Quel prix visez-vous pour la vente ?",
        "Quel prix souhaitez-vous obtenir ?",
        "Indiquez-moi le prix de vente de votre bien.",
        "Quel est le tarif proposé pour ce logement ?"
      ]
    },

    pieces: {
      buyer: [
        "Combien de pièces souhaitez-vous ?",
        "Quel est le nombre de pièces minimum ?",
        "Combien de chambres recherchez-vous ?",
        "Quel nombre de pièces vous conviendrait ?",
        "Combien de pièces minimum souhaitez-vous avoir ?",
        "Quel est le nombre de chambres idéal ?",
        "Pouvez-vous préciser le nombre de pièces ?",
        "Combien de pièces voulez-vous au minimum ?",
        "Quel est votre besoin en nombre de pièces ?",
        "Combien de chambres souhaitez-vous ?"
      ],
      seller: [
        "Combien de pièces comporte votre bien ?",
        "Quel est le nombre de chambres de votre logement ?",
        "Pouvez-vous préciser le nombre de pièces ?",
        "Combien de pièces possède votre bien ?",
        "Nombre de chambres à vendre ?",
        "Quel est le nombre total de pièces ?",
        "Indiquez-moi le nombre de chambres.",
        "Combien de pièces et chambres contient votre logement ?",
        "Nombre de pièces du bien ?",
        "Combien de chambres au total ?"
      ]
    },

    espace: {
      buyer: [
        "Quelle surface minimale souhaitez-vous ?",
        "Quelle est la surface idéale en mètres carrés ?",
        "Combien de m² recherchez-vous au minimum ?",
        "Quelle superficie vous conviendrait ?",
        "Pouvez-vous préciser la surface du bien ?",
        "Quelle surface minimum souhaitez-vous ?",
        "Quel est votre besoin en surface ?",
        "Combien de mètres carrés au minimum ?",
        "Quelle surface recherchez-vous ?",
        "Quelle est la surface souhaitée ?"
      ],
      seller: [
        "Quelle est la surface de votre bien ?",
        "Combien de m² fait votre logement ?",
        "Pouvez-vous indiquer la surface exacte ?",
        "Quelle est la superficie du bien à vendre ?",
        "Indiquez-moi le nombre de mètres carrés.",
        "Surface totale de votre logement ?",
        "Quelle est la surface habitables ?",
        "Combien de m² comprend votre bien ?",
        "Pouvez-vous préciser la surface exacte ?",
        "Surface du logement à vendre ?"
      ]
    }
  },

  // ✅ CONFIRMATIONS
  confirmations: {
    type: {
      buyer: [
        "Parfait, j’ai bien noté le type de bien.",
        "C’est noté pour le type de logement.",
        "Très bien, j’ai enregistré le type de bien.",
        "D’accord, le type de logement est noté.",
        "Bien compris pour le type de bien.",
        "Parfait, type de bien enregistré.",
        "Très bien, j’ai compris le type de logement.",
        "C’est clair pour le type de bien.",
        "Parfait, j’ai noté le type de logement.",
        "Bien, le type de bien est enregistré."
      ],
      seller: [
        "Parfait, j’ai bien noté le type de votre bien.",
        "C’est noté pour le type de logement à vendre.",
        "Très bien, j’ai enregistré le type du bien.",
        "D’accord, le type de logement est noté.",
        "Bien compris pour le type de bien à vendre.",
        "Parfait, type de bien enregistré.",
        "Très bien, j’ai compris le type de logement.",
        "C’est clair pour le type de bien.",
        "Parfait, j’ai noté le type de logement.",
        "Bien, le type de bien est enregistré."
      ]
    },

    ville: {
      buyer: [
        "Parfait, j’ai bien noté la ville.",
        "Très bien, la localisation est enregistrée.",
        "C’est noté pour la ville.",
        "D’accord, j’ai enregistré la ville.",
        "Parfait, la ville est bien prise en compte.",
        "Très bien, j’ai noté la localisation.",
        "Bien compris pour la ville.",
        "La ville est enregistrée.",
        "Parfait, j’ai bien noté l’emplacement.",
        "Très bien, la ville est prise en compte."
      ],
      seller: [
        "Parfait, j’ai bien noté la ville de votre bien.",
        "Très bien, la localisation est enregistrée.",
        "C’est noté pour la ville du logement.",
        "D’accord, j’ai enregistré la ville.",
        "Parfait, la ville est bien prise en compte.",
        "Très bien, j’ai noté la localisation.",
        "Bien compris pour la ville du bien.",
        "La ville est enregistrée.",
        "Parfait, j’ai bien noté l’emplacement.",
        "Très bien, la ville est prise en compte."
      ]
    },

    budget: {
      buyer: [
        "Parfait, j’ai bien noté votre budget.",
        "Très bien, le budget est enregistré.",
        "C’est noté pour le budget.",
        "D’accord, j’ai enregistré votre budget.",
        "Parfait, budget pris en compte.",
        "Très bien, j’ai noté le budget.",
        "Bien compris pour le budget.",
        "Le budget est bien enregistré.",
        "Parfait, j’ai bien pris en compte le budget.",
        "Très bien, le budget est noté."
      ],
      seller: [
        "Parfait, j’ai bien noté votre prix de vente.",
        "Très bien, le prix est enregistré.",
        "C’est noté pour le tarif du bien.",
        "D’accord, j’ai enregistré le prix de vente.",
        "Parfait, prix pris en compte.",
        "Très bien, j’ai noté le prix du bien.",
        "Bien compris pour le prix.",
        "Le prix est bien enregistré.",
        "Parfait, j’ai bien pris en compte le prix.",
        "Très bien, le prix est noté."
      ]
    },

    pieces: {
      buyer: [
        "Parfait, j’ai bien noté le nombre de pièces.",
        "Très bien, le nombre de pièces est enregistré.",
        "C’est noté pour les pièces.",
        "D’accord, j’ai enregistré le nombre de pièces.",
        "Parfait, nombre de pièces pris en compte.",
        "Très bien, j’ai noté les pièces.",
        "Bien compris pour le nombre de pièces.",
        "Le nombre de pièces est bien enregistré.",
        "Parfait, j’ai pris en compte les pièces.",
        "Très bien, les pièces sont notées."
      ],
      seller: [
        "Parfait, j’ai bien noté le nombre de pièces de votre bien.",
        "Très bien, le nombre de pièces est enregistré.",
        "C’est noté pour les pièces du logement.",
        "D’accord, j’ai enregistré le nombre de pièces.",
        "Parfait, nombre de pièces pris en compte.",
        "Très bien, j’ai noté les pièces.",
        "Bien compris pour le nombre de pièces.",
        "Le nombre de pièces est bien enregistré.",
        "Parfait, j’ai pris en compte les pièces.",
        "Très bien, les pièces sont notées."
      ]
    },

    espace: {
      buyer: [
        "Parfait, j’ai bien noté la surface.",
        "Très bien, la surface est enregistrée.",
        "C’est noté pour la superficie.",
        "D’accord, j’ai enregistré la surface.",
        "Parfait, surface prise en compte.",
        "Très bien, j’ai noté la superficie.",
        "Bien compris pour la surface.",
        "La surface est bien enregistrée.",
        "Parfait, j’ai pris en compte la surface.",
        "Très bien, la surface est notée."
      ],
      seller: [
        "Parfait, j’ai bien noté la surface de votre bien.",
        "Très bien, la surface est enregistrée.",
        "C’est noté pour la superficie du logement.",
        "D’accord, j’ai enregistré la surface.",
        "Parfait, surface prise en compte.",
        "Très bien, j’ai noté la superficie.",
        "Bien compris pour la surface du bien.",
        "La surface est bien enregistrée.",
        "Parfait, j’ai pris en compte la surface.",
        "Très bien, la surface est notée."
      ]
    }
  },

  // 🔗 TRANSITIONS
  transitions: [
    "Passons à la suite.",
    "Voyons maintenant le point suivant.",
    "Continuons.",
    "Très bien, avançons.",
    "Parfait, poursuivons.",
    "Bien, continuons.",
    "Passons au critère suivant.",
    "Voyons la suite.",
    "Continuons ensemble.",
    "Allons plus loin."
  ]
};
