export default function Impressum() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow p-8 space-y-6">
        <a href="/" className="text-sm text-blue-600 hover:underline">← Zurück zur Karte</a>

        <h1 className="text-2xl font-bold text-gray-900">Impressum</h1>

        <section className="space-y-1 text-gray-700">
          <h2 className="font-semibold text-gray-900">Angaben gemäß § 5 TMG</h2>
          <p>Riccardo Schuster</p>
          <p>Gnomenplatz 14</p>
          <p>13088 Berlin</p>
        </section>

        <section className="space-y-1 text-gray-700">
          <h2 className="font-semibold text-gray-900">Kontakt</h2>
          <p>
            E-Mail:{' '}
            <a href="mailto:riccardo.schuster@gmail.com" className="text-blue-600 hover:underline">
              riccardo.schuster@gmail.com
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
            Zugriffe werden gezählt, um den Betrieb und die Last der Website zu überwachen.
            Gespeichert werden tägliche Summen der Seitenaufrufe sowie der Aufrufe von
            Filterlinks mit den Parametern Betreiber und Autobahn. Bei Filterlinks werden
            zusätzlich der Parameter und sein Wert gespeichert. Diese Zählung dient dem
            Betrieb, nicht der Auswertung von Personen. Für diese Statistik werden keine
            IP-Adressen oder Benutzerkennungen gespeichert und keine Cookies gesetzt.
            Es werden keine externen Tracking-Dienste eingesetzt.
          </p>
          <p>
            Für die Anmeldung zum geschützten Download wird ein technisch notwendiges
            Sitzungscookie gesetzt. Es ist 30 Minuten gültig und dient ausschließlich der
            Zugriffskontrolle, nicht der Nutzungsanalyse.
          </p>
          <p>
            Je nach gewählter Kartengrundlage werden Kartenstile und Kartenkacheln direkt
            von externen Anbietern (BKG bzw. Esri) geladen. Dabei wird unter anderem die
            IP-Adresse an den jeweiligen Anbieter übermittelt. Für diese Anfragen gelten
            dessen Datenschutzbestimmungen.
          </p>
        </section>
      </div>
    </main>
  )
}
