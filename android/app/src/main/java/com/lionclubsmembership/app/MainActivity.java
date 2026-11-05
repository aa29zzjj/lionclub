package com.lionclubsmembership.app;

import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private FrameLayout privacyCover;
    private boolean activityResumed;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // API 33+: affects only the system's Recents representation, not normal
        // foreground screenshots. Older versions use the lifecycle cover below.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            setRecentsScreenshotEnabled(false);
        }
    }

    private void showPrivacyCover() {
        if (privacyCover != null) {
            privacyCover.bringToFront();
            return;
        }
        View decor = getWindow().getDecorView();
        if (!(decor instanceof ViewGroup)) return;
        FrameLayout cover = new FrameLayout(this);
        cover.setBackgroundColor(Color.rgb(10, 13, 24));
        cover.setClickable(true);
        cover.setFocusable(true);
        cover.setContentDescription("LionClubs，會員畫面已隱藏");
        cover.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        TextView label = new TextView(this);
        label.setText("LionClubs");
        label.setTextColor(Color.rgb(200, 169, 81));
        label.setTextSize(26);
        label.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        label.setGravity(Gravity.CENTER);
        cover.addView(label, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        privacyCover = cover;
        ((ViewGroup) decor).addView(cover, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void removePrivacyCover() {
        if (privacyCover == null) return;
        if (privacyCover.getParent() instanceof ViewGroup) {
            ((ViewGroup) privacyCover.getParent()).removeView(privacyCover);
        }
        privacyCover = null;
    }

    @Override
    public void onPause() {
        activityResumed = false;
        showPrivacyCover(); // Synchronous native cover before bridge callbacks.
        super.onPause();
    }

    @Override
    public void onStop() {
        showPrivacyCover();
        super.onStop();
    }

    @Override
    public void onResume() {
        super.onResume();
        activityResumed = true;
        if (hasWindowFocus()) removePrivacyCover();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && activityResumed) removePrivacyCover();
        else showPrivacyCover();
    }
}
