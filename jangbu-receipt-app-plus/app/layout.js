export const metadata = {
  title: "장부 - 영수증 가계부",
  description: "영수증 OCR + 수기 입력 + 품목 가격 비교 + 백업 복구",
};

import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
