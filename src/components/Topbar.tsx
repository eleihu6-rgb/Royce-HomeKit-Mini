import { BREADCRUMBS, type PageId } from '../types/nav'
import { useClock } from '../hooks/useClock'

interface Props {
  currentPage: PageId
}

export default function Topbar({ currentPage }: Props) {
  const clock = useClock()

  return (
    <div className="topbar">
      <div className="topbar-breadcrumb">
        <span>ROIs Crew</span>
        <span className="sep">/</span>
        <span className="current">{BREADCRUMBS[currentPage]}</span>
      </div>
      <div className="topbar-right">
        <div className="topbar-clock">{clock}</div>
        <div className="topbar-user">
          <div className="user-avatar">OP</div>
          <div className="user-name">OPS.ADMIN</div>
        </div>
      </div>
    </div>
  )
}
