stage('OWASP ZAP scan') {
    steps {
        sh 'mkdir -p zap-reports'
        sh """
            docker run --rm \
              --network devops-net \
              -v \$(pwd)/zap-reports:/zap/wrk/:rw \
              ghcr.io/zaproxy/zaproxy:stable \
              zap-baseline.py \
              -t http://nginx-gateway:80 \
              -r zap-report.html \
              -I \
              -z "-config spider.maxDuration=2 -config ajaxSpider.maxDuration=2"
        """
    }
    post {
        always {
            publishHTML(target: [
                allowMissing: true,
                reportDir: 'zap-reports',
                reportFiles: 'zap-report.html',
                reportName: 'OWASP ZAP Report'
            ])
        }
    }
}
