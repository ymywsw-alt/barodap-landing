export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const apiKey = process.env.GOOGLE_VISION_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "GOOGLE_VISION_API_KEY not set",
      });
    }

    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.json({
        definition: "입력된 내용이 없습니다.",
        importance: "판단할 정보가 없습니다.",
        action: "문자, 고지서, 알림 문구를 그대로 붙여넣거나 사진을 다시 올려주세요.",
      });
    }

    const base64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    // 1️⃣ Google Vision OCR 호출
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64 },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            },
          ],
        }),
      }
    );

    const visionData = await visionRes.json();
    const text =
      visionData?.responses?.[0]?.fullTextAnnotation?.text?.trim() || "";

    // 2️⃣ OCR 실패 / 무의미 방어
    if (!text || text.length < 5) {
      return res.json({
        definition: "내용을 인식하지 못했습니다.",
        importance: "잘못 판단하면 불필요한 대응을 할 수 있습니다.",
        action: "사진을 더 선명하게 찍거나 문자 내용을 그대로 붙여넣으세요.",
      });
    }

    // 3️⃣ 결론 타입 강제 분기 (4가지)
    let conclusionType = "GENERAL_NOTICE";

    if (/현금영수증|국세청|세무서|홈택스/.test(text)) {
      conclusionType = "TAX_RECEIPT";
    } else if (/납부|기한|미납|요청|청구|연체/.test(text)) {
      conclusionType = "PAYMENT_REQUEST";
    } else if (/인증|코드|번호|확인번호|OTP/.test(text)) {
      conclusionType = "AUTH_MESSAGE";
    } else if (/취소|환불|처리되었습니다|완료/.test(text)) {
      conclusionType = "PROCESS_RESULT";
    }

    // 4️⃣ 타입별 바로답 (기승전결 X, 핵심만)
    switch (conclusionType) {
      case "TAX_RECEIPT":
        return res.json({
          definition: "국세청·현금영수증 관련 안내로 보입니다.",
          importance:
            "세금·소득 기록과 연결될 수 있어 사실 여부를 확인하는 것이 중요합니다.",
          action:
            "‘취소’, ‘발급’, ‘금액’ 중 무엇인지 문구를 다시 확인하고 필요 시 홈택스에서 조회하세요.",
        });

      case "PAYMENT_REQUEST":
        return res.json({
          definition: "금액 납부 또는 처리 요청 안내로 보입니다.",
          importance:
            "기한을 놓치면 불이익이나 연체가 발생할 수 있습니다.",
          action:
            "납부 기한과 금액이 명확한지 확인하고, 모르는 기관이면 바로 결제하지 마세요.",
        });

      case "AUTH_MESSAGE":
        return res.json({
          definition: "인증번호 또는 본인 확인 안내로 보입니다.",
          importance:
            "타인에게 공유하면 계정·금전 피해가 발생할 수 있습니다.",
          action:
            "직접 요청한 인증이 아니라면 입력하거나 전달하지 마세요.",
        });

      case "PROCESS_RESULT":
        return res.json({
          definition: "요청한 처리 결과를 알리는 안내로 보입니다.",
          importance:
            "취소·환불·완료 여부가 실제 상황과 일치하는지 확인이 필요합니다.",
          action:
            "본인이 요청한 건이 맞는지, 금액·날짜가 정확한지 확인하세요.",
        });

      default:
        return res.json({
          definition: "일반 안내 또는 알림으로 보입니다.",
          importance:
            "정보가 불완전하면 잘못 판단할 가능성이 있습니다.",
          action:
            "발신 기관 이름과 요구 사항이 무엇인지 한 줄만 추가해 다시 올려주세요.",
        });
    }
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Server error",
      detail: error.message,
    });
  }
}
