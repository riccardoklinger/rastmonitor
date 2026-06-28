export default function Impressum() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow p-8 space-y-6">
        <a href="/" className="text-sm text-blue-600 hover:underline">← Zurück zur Karte</a>

        <h1 className="text-2xl font-bold text-gray-900">Impressum</h1>

        <section className="space-y-1 text-gray-700">
          <h2 className="font-semibold text-gray-900">Angaben gemäß § 5 TMG</h2>
          <p>Riccardo Klinger</p>
          <p>Gnomenplatz 14</p>
          <p>13088 Berlin</p>
        </section>

        <section className="space-y-1 text-gray-700">
          <h2 className="font-semibold text-gray-900">Kontakt</h2>
          <p>
            E-Mail:{' '}
            <a href="mailto:riccardo.klinger@gmail.com" className="text-blue-600 hover:underline">
              riccardo.klinger@gmail.com
            </a>
          </p>
        </section>

        <section className="space-y-2 text-gray-700 text-sm">
          <h2 className="font-semibold text-gray-900">Haftungsausschluss</h2>
          <p>
            Die auf dieser Website bereitgestellten Daten zur Lkw-Parkplatzbelegung stammen aus
            öffentlich zugänglichen Quellen (Toll Collect / Mobilithek) und werden ohne Gewähr
            veröffentlicht. Für die Richtigkeit, Vollständigkeit und Aktualität der Daten wird
            keine Haftung übernommen.
          </p>
          <p>
            Trotz sorgfältiger inhaltlicher Kontrolle übernehme ich keine Haftung für die Inhalte
            externer Links. Für den Inhalt der verlinkten Seiten sind ausschließlich deren
            Betreiber verantwortlich.
          </p>
        </section>

        <section className="space-y-2 text-gray-700 text-sm">
          <h2 className="font-semibold text-gray-900">Datenschutz</h2>
          <p>
            Diese Website speichert keine personenbezogenen Daten. Es werden keine Cookies gesetzt
            und keine Tracking-Dienste eingesetzt. Die Kartengrundlage wird von einem externen
            Anbieter (OpenFreeMap) bezogen; dabei gelten dessen Datenschutzbestimmungen.
          </p>
        </section>
      </div>
    </main>
  )
}
