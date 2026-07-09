import { DataProvider } from './contexts/DataContext'
import { ThemeProvider } from './contexts/ThemeContext'
import MapView from './Map'

function App() {
  return (
    <ThemeProvider>
      <DataProvider>
        <MapView />
      </DataProvider>
    </ThemeProvider>
  )
}

export default App
