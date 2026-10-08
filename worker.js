const BASE = "https://www.tyf.gov.tr";
const NEWS = BASE + "/haberler/";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};


export default {

  async fetch(request) {

    if (request.method === "OPTIONS") {

      return new Response(null, {
        status: 204,
        headers: CORS
      });

    }


    const url = new URL(request.url);


    if (url.pathname === "/") {

      return send({

        ok: true,

        service:
          "SporNRD Akıllı Spor Editörü",

        source:
          "Türkiye Yüzme Federasyonu",

        status:
          "running",

        version:
          "5.0.0"

      });

    }


    if (url.pathname !== "/api/tyf") {

      return send({
        ok: false,
        error: "Endpoint bulunamadı"
      }, 404);

    }


    try {

      let limit =
        parseInt(
          url.searchParams.get("limit") || "10",
          10
        );


      if (!Number.isFinite(limit)) {
        limit = 10;
      }


      limit =
        Math.max(
          1,
          Math.min(limit, 20)
        );


      const items =
        await getNews(limit);


      return send({

        ok: true,

        source: {

          id:
            "tyf",

          name:
            "Türkiye Yüzme Federasyonu",

          sourceType:
            "FEDERASYON",

          sport:
            "Yüzme",

          verified:
            true,

          website:
            BASE

        },

        fetchedAt:
          new Date().toISOString(),

        count:
          items.length,

        items:
          items

      });

    }

    catch (error) {

      return send({

        ok: false,

        error:
          "TYF verileri alınamadı",

        detail:
          String(
            error &&
            error.message
              ? error.message
              : error
          )

      }, 502);

    }

  }

};


// =====================================================
// HABER LİSTESİ
// =====================================================

async function getNews(limit) {

  const html =
    await getHtml(NEWS);


  const links =
    findLinks(html)
      .slice(0, 25);


  const results =
    await Promise.allSettled(
      links.map(readArticle)
    );


  return results

    .filter(
      result =>
        result.status === "fulfilled" &&
        result.value
    )

    .map(
      result =>
        result.value
    )

    .filter(
      item =>
        item.relevanceScore >= 3
    )

    .sort(
      (a, b) =>
        (b.timestamp || 0) -
        (a.timestamp || 0)
    )

    .slice(
      0,
      limit
    );

}


// =====================================================
// HTML AL
// =====================================================

async function getHtml(url) {

  const response =
    await fetch(
      url,
      {

        headers: {

          "Accept":
            "text/html",

          "Accept-Language":
            "tr-TR,tr;q=0.9"

        }

      }
    );


  if (!response.ok) {

    throw new Error(
      "HTTP " +
      response.status
    );

  }


  return response.text();

}


// =====================================================
// HABER LINKLERİ
// =====================================================

function findLinks(html) {

  const list = [];

  const used =
    new Set();


  const regex =
    /href=["']([^"']*\/haber\/[^"']+\.html[^"']*)["']/gi;


  let match;


  while (
    (match = regex.exec(html)) !== null
  ) {

    let url;


    try {

      url =
        new URL(
          decode(match[1]),
          BASE
        ).href;

    }

    catch {

      continue;

    }


    if (
      used.has(url)
    ) {

      continue;

    }


    used.add(url);

    list.push(url);

  }


  return list;

}


// =====================================================
// HABER DETAYI
// =====================================================

async function readArticle(url) {

  const html =
    await getHtml(url);


  const originalTitle =
    getTitle(html);


  if (!originalTitle) {

    return null;

  }


  const originalText =
    getBody(
      html,
      originalTitle
    );


  const analysis =
    analyse(
      originalTitle,
      originalText
    );


  if (!analysis.keep) {

    return null;

  }


  const date =
    getDate(html);


  const location =
    getLocation(
      originalTitle +
      " " +
      originalText
    );


  const image =
    getImage(html);


  const pdfUrl =
    getPdf(html);


  const editorial =
    createEditorial({

      originalTitle:
        originalTitle,

      originalText:
        originalText,

      category:
        analysis.category,

      location:
        location,

      pdfUrl:
        pdfUrl

    });


  return {

    id:
      makeId(url),

    externalId:
      makeId(url),


    // SporNRD kullanıcısının gördüğü metin

    title:
      editorial.title,

    summary:
      editorial.summary,


    // Orijinal kaynak bilgisi

    originalTitle:
      originalTitle,

    originalText:
      originalText,


    editorial:
      true,

    editorialLabel:
      "SporNRD Özeti",


    source:
      "Türkiye Yüzme Federasyonu",

    sourceType:
      "FEDERASYON",

    verified:
      true,

    sport:
      "Yüzme",

    category:
      analysis.category,

    audience:
      analysis.audience,

    relevanceScore:
      analysis.score,

    urgency:
      editorial.urgency,

    actionLabel:
      editorial.actionLabel,

    tags:
      editorial.tags,

    date:
      date.text,

    timestamp:
      date.time,

    location:
      location,

    image:
      image,

    url:
      url,

    pdfUrl:
      pdfUrl,

    emoji:
      getEmoji(
        analysis.category
      )

  };

}


// =====================================================
// KİMİ İLGİLENDİRİYOR?
// DOĞRU KATEGORİ
// =====================================================

function analyse(
  title,
  body
) {

  const titleText =
    normalize(title);


  const allText =
    normalize(
      title +
      " " +
      body
    );


  // -------------------------------------------------
  // İSTEMEDİĞİMİZ KURUMSAL HABERLER
  // -------------------------------------------------

  if (
    titleText.includes(
      "GENEL KURUL"
    ) ||
    titleText.includes(
      "DELEGE"
    ) ||
    titleText.includes(
      "IHALE"
    ) ||
    titleText.includes(
      "SATIN ALMA"
    )
  ) {

    return {

      keep:
        false,

      category:
        "announcement",

      audience:
        "general",

      score:
        0

    };

  }


  // -------------------------------------------------
  // SPORCU
  // Öncelik EĞİTİM kelimesinden önce.
  // SEM hatasını böyle çözüyoruz.
  // -------------------------------------------------

  if (
    titleText.includes(
      "SPORCU"
    ) ||
    titleText.includes(
      "SEM "
    ) ||
    titleText.includes(
      "SEM)"
    ) ||
    titleText.includes(
      "TOHM"
    ) ||
    titleText.includes(
      "MILLI TAKIM"
    ) ||
    titleText.includes(
      "MILLI SPORCU"
    )
  ) {

    return {

      keep:
        true,

      category:
        "athlete",

      audience:
        "sporcu",

      score:
        10

    };

  }


  // -------------------------------------------------
  // ANTRENÖR
  // -------------------------------------------------

  if (
    titleText.includes(
      "ANTRENOR"
    )
  ) {

    return {

      keep:
        true,

      category:
        "coach",

      audience:
        "antrenör",

      score:
        10

    };

  }


  // -------------------------------------------------
  // YARIŞMA
  // -------------------------------------------------

  if (
    hasAny(
      titleText,
      [
        "SAMPIYONA",
        "MUSABAKA",
        "YARISMA",
        "YARIS",
        "LIG",
        "KUPA",
        "TURNUVA",
        "FINAL"
      ]
    )
  ) {

    return {

      keep:
        true,

      category:
        "event",

      audience:
        "sporcu",

      score:
        9

    };

  }


  // -------------------------------------------------
  // EĞİTİM
  // -------------------------------------------------

  if (
    hasAny(
      titleText,
      [
        "KURS",
        "SEMINER",
        "EGITIM"
      ]
    )
  ) {

    return {

      keep:
        true,

      category:
        "education",

      audience:
        "general",

      score:
        7

    };

  }


  // -------------------------------------------------
  // DUYURU
  // -------------------------------------------------

  if (
    hasAny(
      allText,
      [
        "BASVURU",
        "KAYIT",
        "KRITER",
        "DUYURU",
        "TAKVIM",
        "BILGILENDIRME"
      ]
    )
  ) {

    return {

      keep:
        true,

      category:
        "announcement",

      audience:
        "general",

      score:
        5

    };

  }


  return {

    keep:
      false,

    category:
      "announcement",

    audience:
      "general",

    score:
      0

  };

}


// =====================================================
// SPORNRD AKILLI EDİTÖR
// =====================================================

function createEditorial(data) {

  const normalized =
    normalize(
      data.originalTitle
    );


  let title =
    "";

  let actionLabel =
    "Detayı Gör";

  let urgency =
    "normal";


  const tags =
    [
      "Yüzme"
    ];


  // -------------------------------------------------
  // SEM KAYIT HAKKI KAZANANLAR
  // -------------------------------------------------

  if (
    normalized.includes(
      "SEM"
    ) &&
    normalized.includes(
      "KAYIT HAKKI KAZANAN"
    )
  ) {

    title =
      "SEM’de kayıt hakkı kazanan yüzücüler açıklandı 🏊";


    actionLabel =
      "Listeyi Kontrol Et";


    tags.push(
      "SEM",
      "Sporcu"
    );

  }


  // -------------------------------------------------
  // SEM / TOHM BAŞVURU
  // -------------------------------------------------

  else if (
    normalized.includes(
      "TOHM"
    ) &&
    normalized.includes(
      "BASVURU"
    )
  ) {

    title =
      "TOHM sporcu başvuruları için yeni bilgilendirme";


    actionLabel =
      "Başvuruyu İncele";


    tags.push(
      "TOHM",
      "Sporcu"
    );

  }


  else if (
    normalized.includes(
      "SEM"
    ) &&
    normalized.includes(
      "BASLIYOR"
    )
  ) {

    title =
      "SEM yüzme sporcu alımları başlıyor 🏊";


    actionLabel =
      "Başvuruyu İncele";


    tags.push(
      "SEM",
      "Başvuru"
    );

  }


  // -------------------------------------------------
  // ANTRENÖR VİZE
  // -------------------------------------------------

  else if (
    normalized.includes(
      "ANTRENOR VIZE"
    )
  ) {

    title =
      "Yüzme antrenörleri için vize duyurusu yayımlandı";


    actionLabel =
      "Vize Detayları";

    tags.push(
      "Antrenör",
      "Vize"
    );

  }


  // -------------------------------------------------
  // ANTRENÖR KURSU
  // -------------------------------------------------

  else if (
    normalized.includes(
      "ANTRENOR"
    ) &&
    normalized.includes(
      "KURS"
    )
  ) {

    const grade =
      getGrade(
        data.originalTitle
      );


    const eventDate =
      getEventDate(
        data.originalTitle
      );


    title =
      grade
        ? grade +
          ". Kademe yüzme antrenörlüğü kursu"
        : "Yüzme antrenörlüğü kursu";


    const facts = [];


    if (
      data.location !==
      "Türkiye"
    ) {

      facts.push(
        data.location
      );

    }


    if (eventDate) {

      facts.push(
        eventDate
      );

    }


    if (
      facts.length
    ) {

      title +=
        ": " +
        facts.join(
          " · "
        );

    }


    actionLabel =
      "Kurs Detayları";


    tags.push(
      "Antrenör",
      "Kurs"
    );

  }


  // -------------------------------------------------
  // MASTER
  // -------------------------------------------------

  else if (
    normalized.includes(
      "MASTER"
    ) &&
    normalized.includes(
      "SAMPIYONA"
    )
  ) {

    title =
      "Master yüzücüler için kısa kulvar şampiyonası duyuruldu 🏆";


    actionLabel =
      "Şampiyonayı İncele";


    tags.push(
      "Master",
      "Şampiyona"
    );

  }


  // -------------------------------------------------
  // DİĞER YARIŞMA
  // -------------------------------------------------

  else if (
    data.category ===
    "event"
  ) {

    title =
      cleanDisplayTitle(
        data.originalTitle
      );


    actionLabel =
      "Yarışmayı İncele";


    tags.push(
      "Yarışma"
    );

  }


  // -------------------------------------------------
  // EĞİTİM
  // -------------------------------------------------

  else if (
    data.category ===
    "education"
  ) {

    title =
      cleanDisplayTitle(
        data.originalTitle
      );


    actionLabel =
      "Eğitimi İncele";


    tags.push(
      "Eğitim"
    );

  }


  // -------------------------------------------------
  // DİĞER
  // -------------------------------------------------

  else {

    title =
      cleanDisplayTitle(
        data.originalTitle
      );

  }


  const summary =
    createSmartSummary(
      data
    );


  if (
    detectUrgency(
      data.originalText
    )
  ) {

    urgency =
      "important";

  }


  return {

    title:
      title,

    summary:
      summary,

    actionLabel:
      actionLabel,

    urgency:
      urgency,

    tags:
      tags

  };

}


// =====================================================
// AKILLI ÖZET
// =====================================================

function createSmartSummary(data) {

  const body =
    clean(
      data.originalText
    );


  const title =
    normalize(
      data.originalTitle
    );


  // -------------------------------------------------
  // SEM SONUÇ HABERİ
  // -------------------------------------------------

  if (
    title.includes(
      "SEM"
    ) &&
    title.includes(
      "KAYIT HAKKI KAZANAN"
    )
  ) {

    const first =
      findSentence(
        body,
        [
          "kayıt hakkı kazanan",
          "listesi"
        ]
      );


    const second =
      findSentence(
        body,
        [
          "10 iş günü",
          "kayıt işlemlerini"
        ]
      );


    const result =
      joinSentences(
        first,
        second
      );


    if (result) {

      return shorten(
        result,
        360
      );

    }

  }


  // -------------------------------------------------
  // BAŞVURU
  // -------------------------------------------------

  if (
    title.includes(
      "BASVURU"
    ) ||
    body.toLocaleLowerCase("tr-TR")
      .includes(
        "başvuru"
      )
  ) {

    const sentences =
      bestSentences(
        body,
        [
          "başvuru",
          "e-devlet",
          "tarih",
          "gerekmektedir",
          "kriter"
        ],
        2
      );


    if (sentences) {

      return shorten(
        sentences,
        360
      );

    }

  }


  // -------------------------------------------------
  // GERÇEK HABER METNİ VARSA
  // -------------------------------------------------

  if (
    body.length >= 80
  ) {

    const sentences =
      bestSentences(
        body,
        [
          "gerekmektedir",
          "başvuru",
          "kayıt",
          "tarih",
          "sporcu",
          "antrenör",
          "şampiyona",
          "müsabaka",
          "duyurulur"
        ],
        2
      );


    if (sentences) {

      return shorten(
        sentences,
        360
      );

    }


    return shorten(
      body,
      320
    );

  }


  // -------------------------------------------------
  // METİN YETERSİZSE GERÇEK BAŞLIK BİLGİLERİ
  // -------------------------------------------------

  const facts = [];


  const eventDate =
    getEventDate(
      data.originalTitle
    );


  if (eventDate) {

    facts.push(
      "Tarih: " +
      eventDate +
      "."
    );

  }


  if (
    data.location &&
    data.location !==
    "Türkiye"
  ) {

    facts.push(
      "Yer: " +
      data.location +
      "."
    );

  }


  if (
    data.pdfUrl
  ) {

    facts.push(
      "Ayrıntılar federasyonun resmî duyurusunda yer alıyor."
    );

  }


  return (
    "Türkiye Yüzme Federasyonu yeni bir resmî duyuru yayımladı. " +
    facts.join(" ")
  ).trim();

}


// =====================================================
// EN ÖNEMLİ CÜMLELER
// =====================================================

function bestSentences(
  text,
  keywords,
  count
) {

  const sentences =
    splitSentences(
      text
    );


  const ranked =
    sentences.map(
      function (sentence, index) {

        const lower =
          sentence.toLocaleLowerCase(
            "tr-TR"
          );


        let score =
          0;


        for (
          const keyword
          of keywords
        ) {

          if (
            lower.includes(
              keyword.toLocaleLowerCase(
                "tr-TR"
              )
            )
          ) {

            score += 3;

          }

        }


        if (
          /\d/.test(
            sentence
          )
        ) {

          score += 1;

        }


        return {

          sentence:
            sentence,

          index:
            index,

          score:
            score

        };

      }
    );


  const chosen =
    ranked

      .filter(
        item =>
          item.score > 0
      )

      .sort(
        (a, b) =>
          b.score - a.score
      )

      .slice(
        0,
        count
      )

      .sort(
        (a, b) =>
          a.index - b.index
      )

      .map(
        item =>
          item.sentence
      );


  return chosen.join(" ");

}


// =====================================================
// CÜMLE BUL
// =====================================================

function findSentence(
  text,
  keywords
) {

  const sentences =
    splitSentences(
      text
    );


  for (
    const sentence
    of sentences
  ) {

    const lower =
      sentence.toLocaleLowerCase(
        "tr-TR"
      );


    for (
      const keyword
      of keywords
    ) {

      if (
        lower.includes(
          keyword.toLocaleLowerCase(
            "tr-TR"
          )
        )
      ) {

        return sentence;

      }

    }

  }


  return "";

}


// =====================================================
// HABER METNİ
// =====================================================

function getBody(
  html,
  title
) {

  const parts =
    [];


  const regex =
    /<(p|h2|h3|h4)\b[^>]*>([\s\S]*?)<\/\1>/gi;


  let match;


  while (
    (match = regex.exec(html)) !== null
  ) {

    const text =
      clean(
        match[2]
      );


    if (
      text.length < 20
    ) {

      continue;

    }


    if (
      normalize(text) ===
      normalize(title)
    ) {

      continue;

    }


    const value =
      normalize(text);


    if (
      value.includes(
        "TUM HAKLARI"
      ) ||
      value.includes(
        "CEREZ"
      ) ||
      value.includes(
        "KVKK"
      )
    ) {

      continue;

    }


    parts.push(text);

  }


  return [
    ...new Set(parts)
  ]
    .join(" ")
    .slice(
      0,
      2500
    );

}


// =====================================================
// BAŞLIK
// =====================================================

function getTitle(html) {

  const match =
    html.match(
      /<h1\b[^>]*>([\s\S]*?)<\/h1>/i
    );


  return match
    ? clean(match[1])
    : "";

}


// =====================================================
// TARİH
// =====================================================

function getDate(html) {

  const regex =
    /(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(20\d{2})/i;


  const match =
    html.match(regex);


  if (!match) {

    return {
      text: "",
      time: 0
    };

  }


  const months = [
    "OCAK",
    "SUBAT",
    "MART",
    "NISAN",
    "MAYIS",
    "HAZIRAN",
    "TEMMUZ",
    "AGUSTOS",
    "EYLUL",
    "EKIM",
    "KASIM",
    "ARALIK"
  ];


  const month =
    months.indexOf(
      normalize(
        match[2]
      )
    );


  return {

    text:
      match[1] +
      " " +
      match[2] +
      " " +
      match[3],

    time:
      month >= 0

        ? Date.UTC(
            Number(
              match[3]
            ),
            month,
            Number(
              match[1]
            )
          )

        : 0

  };

}


// =====================================================
// GÖRSEL
// =====================================================

function getImage(html) {

  const og =
    html.match(
      /property=["']og:image["'][^>]*content=["']([^"']+)["']/i
    );


  if (og) {

    try {

      return new URL(
        decode(og[1]),
        BASE
      ).href;

    }

    catch {
    }

  }


  const direct =
    html.match(
      /https?:\/\/dosya\.tyf\.gov\.tr\/[^"'<> ]+\.(?:jpg|jpeg|png|webp)/i
    );


  return direct
    ? decode(direct[0])
    : "";

}


// =====================================================
// PDF
// =====================================================

function getPdf(html) {

  const match =
    html.match(
      /href=["']([^"']+\.pdf[^"']*)["']/i
    );


  if (!match) {

    return "";

  }


  try {

    return new URL(
      decode(match[1]),
      BASE
    ).href;

  }

  catch {

    return "";

  }

}


// =====================================================
// ŞEHİR
// =====================================================

function getLocation(value) {

  const text =
    normalize(value);


  const cities = [

    ["ANKARA", "Ankara"],

    ["ISTANBUL", "İstanbul"],

    ["IZMIR", "İzmir"],

    ["BURSA", "Bursa"],

    ["ANTALYA", "Antalya"],

    ["AYDIN", "Aydın"],

    ["SAMSUN", "Samsun"],

    ["TRABZON", "Trabzon"],

    ["KONYA", "Konya"],

    ["MERSIN", "Mersin"],

    ["ORDU", "Ordu"],

    ["NIGDE", "Niğde"],

    ["KUTAHYA", "Kütahya"],

    ["DIYARBAKIR", "Diyarbakır"]

  ];


  for (
    const city
    of cities
  ) {

    if (
      text.includes(
        city[0]
      )
    ) {

      return city[1];

    }

  }


  return "Türkiye";

}


// =====================================================
// KADEME
// =====================================================

function getGrade(title) {

  const match =
    String(title)
      .match(
        /(\d+)\.\s*KADEME/i
      );


  return match
    ? match[1]
    : "";

}


// =====================================================
// ETKİNLİK TARİHİ
// =====================================================

function getEventDate(title) {

  const months =
    "Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık";


  const range =
    new RegExp(
      "(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s+(" +
      months +
      ")\\s+(20\\d{2})",
      "i"
    );


  const match =
    String(title)
      .match(range);


  if (match) {

    return (
      match[1] +
      "–" +
      match[2] +
      " " +
      match[3] +
      " " +
      match[4]
    );

  }


  return "";

}


// =====================================================
// ACİL / ÖNEMLİ
// =====================================================

function detectUrgency(text) {

  const value =
    normalize(text);


  return (
    value.includes(
      "SON BASVURU"
    ) ||
    value.includes(
      "10 IS GUNU"
    ) ||
    value.includes(
      "SON TARIH"
    )
  );

}


// =====================================================
// YARDIMCILAR
// =====================================================

function hasAny(
  text,
  list
) {

  return list.some(
    item =>
      text.includes(
        item
      )
  );

}


function splitSentences(text) {

  const matches =
    String(text || "")
      .match(
        /[^.!?]+[.!?]+|[^.!?]+$/g
      );


  return matches
    ? matches
        .map(
          item =>
            item.trim()
        )
        .filter(Boolean)
    : [];

}


function joinSentences(
  first,
  second
) {

  if (
    first &&
    second &&
    first !== second
  ) {

    return (
      first +
      " " +
      second
    );

  }


  return (
    first ||
    second ||
    ""
  );

}


function cleanDisplayTitle(
  title
) {

  const text =
    clean(title);


  if (
    text.length <= 95
  ) {

    return text;

  }


  return shorten(
    text,
    95
  );

}


function shorten(
  value,
  max
) {

  const text =
    clean(value);


  if (
    text.length <= max
  ) {

    return text;

  }


  const part =
    text.slice(
      0,
      max
    );


  const space =
    part.lastIndexOf(
      " "
    );


  return (
    part.slice(
      0,
      space > 0
        ? space
        : max
    ) +
    "…"
  );

}


function getEmoji(category) {

  const values = {

    coach:
      "🧑‍🏫",

    athlete:
      "🏊",

    event:
      "🏆",

    education:
      "🎓",

    announcement:
      "📢"

  };


  return (
    values[
      category
    ] ||
    "🏊"
  );

}


function clean(value) {

  return decode(
    String(
      value ||
      ""
    )
  )

    .replace(
      /<[^>]+>/g,
      " "
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();

}


function decode(value) {

  return String(
    value ||
    ""
  )

    .replaceAll(
      "&amp;",
      "&"
    )

    .replaceAll(
      "&quot;",
      "\""
    )

    .replaceAll(
      "&#39;",
      "'"
    )

    .replaceAll(
      "&nbsp;",
      " "
    )

    .replaceAll(
      "&lt;",
      "<"
    )

    .replaceAll(
      "&gt;",
      ">"
    );

}


function normalize(value) {

  return String(
    value ||
    ""
  )

    .toLocaleUpperCase(
      "tr-TR"
    )

    .replaceAll(
      "Ç",
      "C"
    )

    .replaceAll(
      "Ğ",
      "G"
    )

    .replaceAll(
      "İ",
      "I"
    )

    .replaceAll(
      "Ö",
      "O"
    )

    .replaceAll(
      "Ş",
      "S"
    )

    .replaceAll(
      "Ü",
      "U"
    );

}


function makeId(value) {

  let hash =
    0;


  const text =
    String(
      value ||
      ""
    );


  for (
    let i = 0;
    i < text.length;
    i++
  ) {

    hash =
      (
        (
          hash << 5
        ) -
        hash
      ) +
      text.charCodeAt(i);


    hash |= 0;

  }


  return (
    "tyf-" +
    Math.abs(hash)
  );

}


function send(
  data,
  status = 200
) {

  return new Response(

    JSON.stringify(
      data,
      null,
      2
    ),

    {

      status:
        status,

      headers: {

        ...CORS,

        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "public, max-age=300"

      }

    }

  );

}