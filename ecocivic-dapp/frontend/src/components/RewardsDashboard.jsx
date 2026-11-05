import React from "react";
import TrustScoreCard from "./TrustScoreCard";

/**
 * Geriye dönük uyumluluk sarmalayıcısı:
 * Su Beyanı ve Atık Kiosku sayfalarında kompakt "Çevre & Güven Puanım" kartını gösterir.
 */
export default function RewardsDashboard({ compact = false }) {
  return <TrustScoreCard compact={compact} />;
}
