import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; screenName?: string };
type State = { hasError: boolean };

/** Keep a broken screen from removing the app's navigation. Do not explicitly
 * render or report the caught error: it can include member information. */
export default class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Deliberately no console or remote telemetry of private screen contents.
  }

  private retry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <section className="screen-error" role="alert">
        <h1 className="screen-title">{this.props.screenName ?? "此頁"}暫時無法顯示</h1>
        <p>尚未確認任何操作成功。您可以重新載入本頁，或使用下方分頁前往其他功能。</p>
        <p className="member-meta">重新載入只會重建畫面，不會自動重送報名、發送或刪除操作。</p>
        <button type="button" className="secondary" onClick={this.retry}>重新載入本頁</button>
      </section>
    );
  }
}
