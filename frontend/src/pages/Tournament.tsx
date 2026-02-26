// 대회 편성 페이지 — 추후 자동 편성 엔진 v2 연동 예정
export default function Tournament() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 text-center shadow-sm">
      <h2 className="font-medium text-slate-900 mb-2">대회 편성</h2>
      <p className="text-sm text-slate-500">
        대진 자동 편성 기능은 준비 중입니다.
        <br />
        현재는 Streamlit 앱에서 편성 후 결과를 확인하세요.
      </p>
    </div>
  );
}
