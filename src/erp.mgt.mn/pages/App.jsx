import { useTranslation } from 'react-i18next';

export default function App() {
  const { t } = useTranslation();

  return (
    <div className="p-6 text-xl font-bold text-green-700">
      {t('app.scaffold', 'MM ERP Final Scaffold ✅')}
    </div>
  );
}
