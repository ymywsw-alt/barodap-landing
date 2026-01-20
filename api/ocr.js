export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const key = process.env.GOOGLE_VISION_API_KEY;
    if (!key) {
      return res.status(500).json({ ok: false, error: "Missing GOOGLE_VISION_API_KEY" });
    }

    const { imageBase64 } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ ok: false, error: "Missing imageBase64" });
    }

    // Vision API payload: 1) DOCUMENT_TEXT_DETECTION 우선 (영수증/고지서/문서에 강함)
    //                 2) 실패/빈 결과면 TEXT_DETECTION으로 fallback
    async function callVision(featureType) {
      const payload = {
        requests: [
          {
            image: { content: imageBase64 },
            features: [{ type: featureType }],
            imageContext: {
              // 한글+숫자 우선
              languageHints: ["ko", "en"],
            },
          },
        ],
      };

      const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await r.json();
      if (!r.ok) {
        const msg = json?.error?.message || "Vision API error";
        throw new Error(msg);
      }
      return json;
    }

    function extractText(json, featureType) {
      const resp = json?.responses?.[0] || {};

      // DOCUMENT_TEXT_DETECTION 결과
      if (featureType === "DOCUMENT_TEXT_DETECTION") {
        const t = resp?.fullTextAnnotation?.text;
        if (t && t.trim()) return t.trim();
      }

      // TEXT_DETECTION 결과(일반 텍스트)
      // textAnnotations[0].description이 전체 텍스트인 경우가 많음
      const ta0 = resp?.textAnnotations?.[0]?.description;
      if (ta0 && ta0.trim()) return ta0.trim();

      // (드물게) fullTextAnnotation이 채워지는 경우도 있음
      const ft = resp?.fullTextAnnotation?.text;
      if (ft && ft.trim()) return ft.trim();

      return "";
    }

    // 1차: 문서 OCR
    let json1 = await callVision("DOCUMENT_TEXT_DETECTION");
    let text = extractText(json1, "DOCUMENT_TEXT_DETECTION");

    // 2차: 일반 OCR fallback
    if (!text) {
      let json2 = await callVision("TEXT_DETECTION");
      text = extractText(json2, "TEXT_DETECTION");
    }

    // 최종 안전장치: 그래도 없으면 실패 응답
    if (!text) {
      return res.status(200).json({
        ok: true,
        text: "",
        warn: "NO_TEXT_DETECTED",
      });
    }

    // 텍스트 정리: 너무 깨진 문자/빈줄 폭발을 최소화
    const cleaned = text
      .replace(/\u0000/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return res.status(200).json({ ok: true, text: cleaned });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e?.message || "Server error",
    });
  }
}
