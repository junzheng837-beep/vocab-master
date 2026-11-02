import StudyView from '../components/StudyView'

export default function StudyPage({ scope }: { scope: string | null }) {
  return <StudyView scope={scope} />
}
