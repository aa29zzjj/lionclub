import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var privacyCover: UIView?

    private func hidePrivateSnapshot() {
        guard let window, privacyCover == nil else { return }
        let cover = UIView(frame: window.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.backgroundColor = UIColor(red: 10 / 255, green: 13 / 255, blue: 24 / 255, alpha: 1)
        cover.isAccessibilityElement = true
        cover.accessibilityLabel = "LionClubs，會員畫面已隱藏"
        let label = UILabel()
        label.text = "LionClubs"
        label.font = .preferredFont(forTextStyle: .title1)
        label.textColor = UIColor(red: 200 / 255, green: 169 / 255, blue: 81 / 255, alpha: 1)
        label.translatesAutoresizingMaskIntoConstraints = false
        cover.addSubview(label)
        NSLayoutConstraint.activate([label.centerXAnchor.constraint(equalTo: cover.centerXAnchor), label.centerYAnchor.constraint(equalTo: cover.centerYAnchor)])
        window.addSubview(cover)
        privacyCover = cover
    }

    func sceneWillResignActive(_ scene: UIScene) { hidePrivateSnapshot() }
    func sceneDidEnterBackground(_ scene: UIScene) { hidePrivateSnapshot() }
    func sceneDidBecomeActive(_ scene: UIScene) {
        privacyCover?.removeFromSuperview()
        privacyCover = nil
    }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
