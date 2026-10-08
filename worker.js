const BASE = "https://www.tyf.gov.tr";
const NEWS = BASE + "/haberler/";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const CITY_MAP = [
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
  ["DIYARBAKIR", "Diyarbakır"],
  ["GAZIANTEP", "Gaziantep"],
  ["ESKISEHIR", "Eskişehir"],
  ["KOCAELI", "Kocaeli"],
  ["DENIZLI", "Denizli"],
  ["MUGLA", "Muğla"],
  ["ADANA", "Adana"],
  ["KAYSERI", "Kayseri"],
  ["SAKARYA", "Sakarya"],
  ["TEKIRDAG", "Tekirdağ"],
  ["BALIKESIR", "Balıkesir"]
];

export default {

  async fetch(request) {

    if (request.method === "OPTIONS") {

      return new Response(
        null,
        {
          status: 204,
          headers: CORS
        }
      );

    }

    const url =
      new URL(request.url);


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
          "5.1.0"

      });

    }


    if (url.pathname !== "/api/tyf") {

      return send(
        {
          ok: false,
          error: "Endpoint bulunamadı"
        },
        404
      );

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
          Math.min(
            limit,
            20
          )
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

      return send(
        {

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

        },
        502
      );

    }

  }

};


// =====================================================
// HABERLER
// =====================================================

async function getNews(limit) {

  const html =
    await getHtml(
      NEWS
    );


  const links =
    findLinks(html)
      .slice(
        0,
        28
      );


  const results =
    await Promise.allSettled(

      links.map(
        readArticle
      )

    );


  return results

    .filter(
      result =>
        result.status ===
        "fulfilled" &&
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
      (a, b) => {

        const dateDiff =
          Number(
            b.timestamp || 0
          ) -
          Number(
            a.timestamp || 0
          );


        if (
          dateDiff !== 0
        ) {

          return dateDiff;

        }


        return (
          Number(
            b.relevanceScore || 0
          ) -
          Number(
            a.relevanceScore || 0
          )
        );

      }
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
            "text/html,application/xhtml+xml",

          "Accept-Language":
            "tr-TR,tr;q=0.9",

          "User-Agent":
            "SporNRD/5.1"

        }

      }
    );


  if (!response.ok) {

    throw new Error(
      "HTTP " +
      response.status +
      " - " +
      url
    );

  }


  return response.text();

}


// =====================================================
// HABER LİNKLERİ
// =====================================================

function findLinks(html) {

  const list =
    [];

  const used =
    new Set();


  const regex =
    /href=["']([^"']*\/haber\/[^"']+\.html(?:\?[^"']*)?)["']/gi;


  let match;


  while (
    (match = regex.exec(html)) !== null
  ) {

    let url;


    try {

      url =
        new URL(
          decodeEntities(
            match[1]
          ),
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
// TEK HABERİ OKU
// =====================================================

async function readArticle(url) {

  try {

    const html =
      await getHtml(url);


    const originalTitle =
      getTitle(html);


    if (!originalTitle) {

      return null;

    }


    const articleRegion =
      getArticleRegion(
        html
      );


    const originalText =
      getBody(
        articleRegion,
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
      getDate(
        articleRegion ||
        html
      );


    const location =
      getLocation(
        originalTitle,
        originalText
      );


    const image =
      getImage(
        html
      );


    const pdfUrl =
      getPdf(
        articleRegion ||
        html
      );


    const editorial =
      createEditorial({

        originalTitle:
          originalTitle,

        originalText:
          originalText,

        category:
          analysis.category,

        audience:
          analysis.audience,

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


      // SporNRD'nin gösterdiği başlık

      title:
        editorial.title,

      summary:
        editorial.summary,


      // Kaynağın gerçek metni

      originalTitle:
        originalTitle,

      originalText:
        originalText,


      editorial:
        true,

      editorialLabel:
        "SporNRD Özeti",

      editorialVersion:
        "5.1.0",


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

  catch (error) {

    console.log(
      "TYF haber detayı okunamadı:",
      url,
      String(error)
    );


    return null;

  }

}


// =====================================================
// SADECE GERÇEK HABER BÖLÜMÜ
// =====================================================

function getArticleRegion(html) {

  const h1Close =
    /<\/h1\s*>/i
      .exec(html);


  const start =
    h1Close

      ? h1Close.index +
        h1Close[0].length

      : 0;


  const tail =
    html.slice(start);


  const stopMarkers = [

    /Temsilcilikler/i,

    /Üyelikler/i,

    /Di(?:ğ|&#287;|&gbreve;)er\s+Haberler/i,

    /Hizmet\s+Sözleşmesi/i,

    /GENEL\s+KOŞULLAR/i

  ];


  let end =
    tail.length;


  for (
    const marker
    of stopMarkers
  ) {

    const found =
      marker.exec(
        tail
      );


    if (
      found &&
      found.index < end
    ) {

      end =
        found.index;

    }

  }


  return tail.slice(
    0,
    end
  );

}


// =====================================================
// HABER METNİ
// =====================================================

function getBody(
  region,
  title
) {

  if (!region) {

    return "";

  }


  const parts =
    [];


  const regex =
    /<(p|h2|h3|h4|h5|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;


  let match;


  while (
    (match = regex.exec(region)) !== null
  ) {

    const text =
      clean(
        match[2]
      );


    if (
      !text ||
      text.length < 18
    ) {

      continue;

    }


    if (
      normalize(text) ===
      normalize(title)
    ) {

      continue;

    }


    if (
      isNoiseText(text)
    ) {

      continue;

    }


    parts.push(text);

  }


  const unique =
    [
      ...new Set(
        parts
      )
    ];


  if (
    unique.length > 0
  ) {

    return unique
      .join(" ")
      .slice(
        0,
        2200
      );

  }


  const fallback =
    clean(
      region
    );


  return isNoiseText(
    fallback
  )

    ? ""

    : fallback.slice(
        0,
        1600
      );

}


// =====================================================
// ÇÖP METİNLER
// =====================================================

function isNoiseText(text) {

  const value =
    normalize(text);


  const noise = [

    "BILGILERI PDF FORMATINDA GORUNTULEMEK",

    "PDF FORMATINDA GORUNTULEMEK",

    "TIKLAYINIZ",

    "TUM HAKLARI SAKLIDIR",

    "TEMSILCILIKLER",

    "UYELIKLER",

    "DIGER HABERLER",

    "HIZMET SOZLESMESI",

    "GENEL KOSULLAR",

    "IPTAL IADE KOSULLARI",

    "KISISSEL BILGI GUVENLIGI",

    "ODEME BILGILERI GUVENLIGI",

    "KREDI KARTI",

    "SPORCU VIZE ODEMESI",

    "KVKK",

    "CEREZ"

  ];


  return noise.some(
    item =>
      value.includes(
        item
      )
  );

}


// =====================================================
// KATEGORİ ANALİZİ
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


  // Kurumsal içerikleri alma

  if (
    hasAny(
      titleText,
      [
        "GENEL KURUL",
        "DELEGE",
        "IHALE",
        "SATIN ALMA"
      ]
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


  // Sporcu, SEM, TOHM

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


  // Antrenör

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


  // Yarışma

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


  // Eğitim

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


  // Genel önemli duyuru

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
// SPORNRD EDİTÖR
// =====================================================

function createEditorial(
  data
) {

  const n =
    normalize(
      data.originalTitle
    );


  const tags =
    [
      "Yüzme"
    ];


  let title =
    "";

  let actionLabel =
    "Detayı Gör";

  let urgency =
    "normal";


  // SEM sonuçları

  if (
    n.includes(
      "SEM"
    ) &&
    n.includes(
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


  // TOHM

  else if (
    n.includes(
      "TOHM"
    ) &&
    n.includes(
      "BASVURU"
    )
  ) {

    title =
      "TOHM sporcu başvurularında yeni dönem";


    actionLabel =
      "Başvuruyu İncele";


    tags.push(
      "TOHM",
      "Sporcu"
    );

  }


  // Antrenör vize

  else if (
    n.includes(
      "ANTRENOR VIZE"
    )
  ) {

    title =
      "Yüzme antrenörleri için vize işlemleri duyuruldu";


    actionLabel =
      "Vize Detayları";


    tags.push(
      "Antrenör",
      "Vize"
    );

  }


  // Antrenör kursu

  else if (
    n.includes(
      "ANTRENOR"
    ) &&
    n.includes(
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


    const facts =
      [];


    if (
      data.location !==
      "Türkiye"
    ) {

      facts.push(
        data.location
      );

    }


    if (
      eventDate
    ) {

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


  // Master şampiyonası

  else if (
    n.includes(
      "MASTER"
    ) &&
    n.includes(
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


  // Diğer yarışmalar

  else if (
    data.category ===
    "event"
  ) {

    title =
      makeGenericEventTitle(
        data.originalTitle
      );


    actionLabel =
      "Yarışmayı İncele";


    tags.push(
      "Yarışma"
    );

  }


  // Eğitim

  else if (
    data.category ===
    "education"
  ) {

    title =
      makeGenericEducationTitle(
        data.originalTitle
      );


    actionLabel =
      "Eğitimi İncele";


    tags.push(
      "Eğitim"
    );

  }


  // Sporcu

  else if (
    data.category ===
    "athlete"
  ) {

    title =
      makeGenericAthleteTitle(
        data.originalTitle
      );


    actionLabel =
      "Sporcu Duyurusunu İncele";


    tags.push(
      "Sporcu"
    );

  }


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
// AKILLI SPORNRD ÖZETİ
// =====================================================

function createSmartSummary(
  data
) {

  const title =
    normalize(
      data.originalTitle
    );


  const body =
    clean(
      data.originalText
    );


  const range =
    extractDateRange(
      data.originalTitle +
      " " +
      body
    );


  const businessDays =
    extractBusinessDays(
      body
    );


  // SEM kayıt sonucu

  if (
    title.includes(
      "SEM"
    ) &&
    title.includes(
      "KAYIT HAKKI KAZANAN"
    )
  ) {

    let first =
      "TYF, SEM yüzme branşında kayıt hakkı kazanan sporcuları duyurdu.";


    if (
      range &&
      /e-?devlet/i.test(
        body
      )
    ) {

      first =
        range +
        " tarihleri arasında e-Devlet üzerinden yapılan başvuruların ardından SEM yüzme branşında kayıt hakkı kazanan sporcular açıklandı.";

    }


    let second =
      "Kayıt ve gerekli belgeler için ilgili Gençlik ve Spor İl Müdürlüğü ile iletişime geçilmesi gerekiyor.";


    if (
      businessDays
    ) {

      second =
        "Hak kazanan sporcuların kayıt işlemlerini " +
        businessDays +
        " iş günü içinde tamamlaması gerekiyor.";

    }


    return shorten(
      first +
      " " +
      second,
      360
    );

  }


  // Antrenör kursu

  if (
    title.includes(
      "ANTRENOR"
    ) &&
    title.includes(
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


    const pieces =
      [];


    pieces.push(

      "TYF, " +

      (
        grade
          ? grade +
            ". Kademe "
          : ""
      ) +

      "yüzme antrenörlüğü kursuna ilişkin yeni duyuruyu yayımladı."

    );


    const facts =
      [];


    if (
      eventDate
    ) {

      facts.push(
        eventDate
      );

    }


    if (
      data.location !==
      "Türkiye"
    ) {

      facts.push(
        data.location
      );

    }


    if (
      facts.length
    ) {

      pieces.push(
        "Kurs " +
        facts.join(
          " · "
        ) +
        " bilgileriyle duyuruldu."
      );

    }


    pieces.push(

      data.pdfUrl

        ? "Başvuru ve katılım ayrıntıları resmî PDF duyurusunda yer alıyor."

        : "Başvuru ve katılım ayrıntıları federasyonun resmî duyurusunda yer alıyor."

    );


    return shorten(
      pieces.join(" "),
      340
    );

  }


  // Antrenör vize

  if (
    title.includes(
      "ANTRENOR VIZE"
    )
  ) {

    return (
      "TYF, yüzme antrenörlerinin vize işlemlerine ilişkin yeni bilgilendirme yayımladı. " +
      "İşlem koşulları ve gerekli adımlar resmî duyuruda yer alıyor."
    );

  }


  // TOHM

  if (
    title.includes(
      "TOHM"
    ) &&
    title.includes(
      "BASVURU"
    )
  ) {

    return (
      "TYF, TOHM sporcu başvurularına ilişkin yeni bilgilendirme yayımladı. " +
      "Başvuru koşulları, tarihler ve gerekli belgeler için resmî duyurunun kontrol edilmesi gerekiyor."
    );

  }


  // Yarışma

  if (
    data.category ===
    "event"
  ) {

    const cleanTitle =
      stripBilingualTail(
        data.originalTitle
      );


    return shorten(

      "TYF, " +
      toSentenceCase(
        cleanTitle
      ) +
      " için yeni yarışma duyurusunu yayımladı. " +
      "Katılım, tarih ve organizasyon ayrıntıları resmî kaynakta yer alıyor.",

      340

    );

  }


  // Eğitim

  if (
    data.category ===
    "education"
  ) {

    return shorten(

      "TYF, yüzme camiasına yönelik yeni eğitim veya seminer duyurusunu yayımladı. " +
      "Tarih, katılım ve başvuru ayrıntıları resmî kaynakta yer alıyor.",

      320

    );

  }


  // Sporcu

  if (
    data.category ===
    "athlete"
  ) {

    return shorten(

      "TYF, sporcuları ilgilendiren yeni bir resmî duyuru yayımladı. " +
      "Başvuru, kayıt veya katılım ayrıntıları için federasyon kaynağının kontrol edilmesi gerekiyor.",

      320

    );

  }


  // Diğer içerikler

  if (
    body.length >= 60
  ) {

    const facts =
      bestSentences(
        body,
        [
          "başvuru",
          "kayıt",
          "gerekmektedir",
          "tarih",
          "sporcu",
          "antrenör",
          "şampiyona",
          "müsabaka"
        ],
        2
      );


    if (
      facts
    ) {

      return shorten(
        facts,
        320
      );

    }

  }


  return (
    "Türkiye Yüzme Federasyonu yeni bir resmî spor duyurusu yayımladı. " +
    "Ayrıntılar federasyonun resmî kaynağında yer alıyor."
  );

}


// =====================================================
// BAŞLIK ÜRETİMİ
// =====================================================

function makeGenericEventTitle(
  title
) {

  const cleanTitle =
    stripBilingualTail(
      title
    );


  const text =
    cleanDisplayTitle(
      cleanTitle
    );


  return text
    .toLocaleLowerCase(
      "tr-TR"
    )
    .includes(
      "duyuru"
    )

    ? text

    : text +
      " 🏆";

}


function makeGenericEducationTitle(
  title
) {

  return cleanDisplayTitle(
    stripBilingualTail(
      title
    )
  );

}


function makeGenericAthleteTitle(
  title
) {

  return cleanDisplayTitle(
    stripBilingualTail(
      title
    )
  );

}


function stripBilingualTail(
  title
) {

  return clean(
    title
  )

    .replace(
      /\s+INTERNATIONAL\b[\s\S]*$/i,
      ""
    )

    .replace(
      /\s+SHORT\s+COURSE\b[\s\S]*$/i,
      ""
    )

    .trim();

}


// =====================================================
// BAŞLIK
// =====================================================

function getTitle(html) {

  const h1 =
    html.match(
      /<h1\b[^>]*>([\s\S]*?)<\/h1>/i
    );


  if (
    h1
  ) {

    return clean(
      h1[1]
    );

  }


  const og =
    html.match(
      /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i
    );


  return og
    ? clean(
        og[1]
      )
    : "";

}


// =====================================================
// TARİH
// =====================================================

function getDate(
  region
) {

  const text =
    clean(region);


  const regex =
    /(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(20\d{2})/i;


  const match =
    text.match(
      regex
    );


  if (!match) {

    return {

      text:
        "",

      time:
        0

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

  const patterns = [

    /<meta\b[^>]*(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,

    /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["'][^>]*>/i

  ];


  for (
    const pattern
    of patterns
  ) {

    const match =
      html.match(
        pattern
      );


    if (!match) {

      continue;

    }


    try {

      return new URL(
        decodeEntities(
          match[1]
        ),
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

    ? decodeEntities(
        direct[0]
      )

    : "";

}


// =====================================================
// PDF
// =====================================================

function getPdf(
  region
) {

  const match =
    region.match(
      /href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i
    );


  if (!match) {

    return "";

  }


  try {

    return new URL(
      decodeEntities(
        match[1]
      ),
      BASE
    ).href;

  }

  catch {

    return "";

  }

}


// =====================================================
// KONUM
// =====================================================

function getLocation(
  title,
  body
) {

  const titleText =
    normalize(
      title
    );


  // Başlıkta şehir varsa güvenilir

  for (
    const [
      key,
      value
    ]
    of CITY_MAP
  ) {

    if (
      titleText.includes(
        key
      )
    ) {

      return value;

    }

  }


  const bodyText =
    normalize(
      body
    );


  // Metinde açık biçimde:
  // Ankara'da, Ankara ilinde vb.

  for (
    const [
      key,
      value
    ]
    of CITY_MAP
  ) {

    const pattern =
      new RegExp(

        "\\b" +
        key +
        "\\b" +
        "(?:'?(?:DA|DE|TA|TE)|\\s+ILINDE|\\s+ILINDEKI)",

        "i"

      );


    if (
      pattern.test(
        bodyText
      )
    ) {

      return value;

    }

  }


  return "Türkiye";

}


// =====================================================
// KADEME
// =====================================================

function getGrade(
  title
) {

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

function getEventDate(
  value
) {

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
    String(value)
      .match(
        range
      );


  if (
    match
  ) {

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
// TARİH ARALIĞI
// =====================================================

function extractDateRange(
  value
) {

  const text =
    clean(
      value
    );


  const months =
    "Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık";


  const regex =
    new RegExp(

      "(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s+(" +
      months +
      ")\\s+(20\\d{2})",

      "i"

    );


  const match =
    text.match(
      regex
    );


  if (!match) {

    return "";

  }


  return (
    Number(
      match[1]
    ) +
    "–" +
    Number(
      match[2]
    ) +
    " " +
    match[3] +
    " " +
    match[4]
  );

}


// =====================================================
// İŞ GÜNÜ
// =====================================================

function extractBusinessDays(
  value
) {

  const match =
    clean(
      value
    )
      .match(
        /(\d+)\s*iş\s*günü/i
      );


  return match
    ? match[1]
    : "";

}


// =====================================================
// ÖNEMLİLİK
// =====================================================

function detectUrgency(
  text
) {

  const value =
    normalize(
      text
    );


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
      (sentence, index) => {

        const lower =
          sentence
            .toLocaleLowerCase(
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

              keyword
                .toLocaleLowerCase(
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


  return ranked

    .filter(
      item =>
        item.score > 0
    )

    .sort(
      (a, b) =>
        b.score -
        a.score
    )

    .slice(
      0,
      count
    )

    .sort(
      (a, b) =>
        a.index -
        b.index
    )

    .map(
      item =>
        item.sentence
    )

    .join(" ");

}


// =====================================================
// CÜMLELERE AYIR
// =====================================================

function splitSentences(
  text
) {

  const matches =
    String(
      text || ""
    )
      .match(
        /[^.!?]+[.!?]+|[^.!?]+$/g
      );


  return matches

    ? matches
        .map(
          item =>
            item.trim()
        )
        .filter(
          Boolean
        )

    : [];

}


// =====================================================
// KELİME KONTROL
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


// =====================================================
// BAŞLIK TEMİZLE
// =====================================================

function cleanDisplayTitle(
  title
) {

  const text =
    clean(
      title
    );


  if (
    text.length <= 105
  ) {

    return toSentenceCase(
      text
    );

  }


  return shorten(

    toSentenceCase(
      text
    ),

    105

  );

}


// =====================================================
// CÜMLE BİÇİMİ
// =====================================================

function toSentenceCase(
  value
) {

  const text =
    clean(
      value
    );


  if (!text) {

    return "";

  }


  const lower =
    text.toLocaleLowerCase(
      "tr-TR"
    );


  return (
    lower
      .charAt(0)
      .toLocaleUpperCase(
        "tr-TR"
      )
    +
    lower.slice(1)
  );

}


// =====================================================
// KISALT
// =====================================================

function shorten(
  value,
  max
) {

  const text =
    clean(
      value
    );


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
    )
    +
    "…"
  );

}


// =====================================================
// EMOJİ
// =====================================================

function getEmoji(
  category
) {

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


// =====================================================
// HTML TEMİZLE
// =====================================================

function clean(
  value
) {

  return decodeEntities(
    String(
      value || ""
    )
  )

    .replace(
      /<script[\s\S]*?<\/script>/gi,
      " "
    )

    .replace(
      /<style[\s\S]*?<\/style>/gi,
      " "
    )

    .replace(
      /<[^>]+>/g,
      " "
    )

    .replace(
      /[\u00A0\u2007\u202F]/g,
      " "
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();

}


// =====================================================
// HTML ENTITY ÇÖZ
// =====================================================

function decodeEntities(
  value
) {

  const named = {

    amp:
      "&",

    quot:
      "\"",

    apos:
      "'",

    nbsp:
      " ",

    lt:
      "<",

    gt:
      ">",

    uuml:
      "ü",

    Uuml:
      "Ü",

    ouml:
      "ö",

    Ouml:
      "Ö",

    ccedil:
      "ç",

    Ccedil:
      "Ç",

    scedil:
      "ş",

    Scedil:
      "Ş",

    gbreve:
      "ğ",

    Gbreve:
      "Ğ",

    Idot:
      "İ",

    inodot:
      "ı",

    rsquo:
      "’",

    lsquo:
      "‘",

    rdquo:
      "”",

    ldquo:
      "“",

    ndash:
      "–",

    mdash:
      "—",

    hellip:
      "…"

  };


  return String(
    value || ""
  )
    .replace(

      /&(#x?[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]+);/g,

      function (
        original,
        entity
      ) {

        // Sayısal HTML entity

        if (
          entity.charAt(0) ===
          "#"
        ) {

          const isHex =
            entity
              .charAt(1)
              .toLowerCase() ===
            "x";


          const raw =
            isHex

              ? entity.slice(2)

              : entity.slice(1);


          const code =
            parseInt(
              raw,
              isHex
                ? 16
                : 10
            );


          if (
            Number.isFinite(
              code
            )
          ) {

            try {

              return String
                .fromCodePoint(
                  code
                );

            }

            catch {

              return original;

            }

          }


          return original;

        }


        return Object
          .prototype
          .hasOwnProperty
          .call(
            named,
            entity
          )

          ? named[
              entity
            ]

          : original;

      }

    );

}


// =====================================================
// NORMALIZE
// =====================================================

function normalize(
  value
) {

  return String(
    value || ""
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


// =====================================================
// ID
// =====================================================

function makeId(
  value
) {

  let hash =
    0;


  const text =
    String(
      value || ""
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
      )
      +
      text.charCodeAt(
        i
      );


    hash |= 0;

  }


  return (
    "tyf-" +
    Math.abs(
      hash
    )
  );

}


// =====================================================
// JSON
// =====================================================

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
          "public, max-age=180"

      }

    }

  );

}import { getTyfFeed } from "./sources/tyf.js";
import { recordFeedback } from "./learning/feedbackEngine.js";
import { readLearningState } from "./learning/learningStore.js";
import { CORS, json } from "./utils/response.js";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/") {
      return json({
        ok: true,
        service: "SporNRD Öğrenen Spor Editörü",
        status: "running",
        version: "6.0.0",
        source: "Türkiye Yüzme Federasyonu",
        learning: env?.SPORNRD_LEARNING ? "global-kv" : "local-fallback"
      });
    }

    if (url.pathname === "/api/tyf" && request.method === "GET") {
      try {
        let limit = parseInt(url.searchParams.get("limit") || "20", 10);
        if (!Number.isFinite(limit)) limit = 20;
        limit = Math.max(1, Math.min(limit, 30));

        const feed = await getTyfFeed({ limit, env });

        return json({
          ok: true,
          source: feed.source,
          fetchedAt: new Date().toISOString(),
          count: feed.items.length,
          items: feed.items
        }, 200, 180);
      } catch (error) {
        return json({
          ok: false,
          error: "TYF verileri alınamadı",
          detail: String(error?.message || error)
        }, 502);
      }
    }

    if (url.pathname === "/api/feedback" && request.method === "POST") {
      try {
        const payload = await request.json();
        const result = await recordFeedback(env, payload);

        return json({
          ok: true,
          persisted: result.persisted,
          mode: result.persisted ? "global-kv" : "local-fallback"
        });
      } catch (error) {
        return json({
          ok: false,
          error: "Feedback işlenemedi",
          detail: String(error?.message || error)
        }, 400);
      }
    }

    if (url.pathname === "/api/learning" && request.method === "GET") {
      const learning = await readLearningState(env);
      return json({
        ok: true,
        mode: env?.SPORNRD_LEARNING ? "global-kv" : "local-fallback",
        learning
      });
    }

    return json({
      ok: false,
      error: "Endpoint bulunamadı"
    }, 404);
  }
};
