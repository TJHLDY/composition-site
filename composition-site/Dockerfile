FROM eclipse-temurin:17-jdk AS build
WORKDIR /workspace

COPY . /workspace

RUN apt-get update && apt-get install -y --no-install-recommends maven \
  && if [ -f server/pom.xml ]; then \
       mvn -f server/pom.xml -DskipTests package; \
       cp server/target/fanwenjia-server-*.jar /workspace/app.jar; \
     elif [ -f composition-site/server/pom.xml ]; then \
       mvn -f composition-site/server/pom.xml -DskipTests package; \
       cp composition-site/server/target/fanwenjia-server-*.jar /workspace/app.jar; \
     else \
       echo \"error: unable to locate server/pom.xml (checked /workspace and /workspace/composition-site)\" && exit 1; \
     fi \
  && rm -rf /var/lib/apt/lists/*

FROM eclipse-temurin:17-jre
WORKDIR /app

COPY --from=build /workspace/app.jar /app/app.jar

EXPOSE 8088
ENV PORT=8088
ENV JAVA_TOOL_OPTIONS="-Xms256m -Xmx512m"

CMD ["sh", "-c", "java -jar /app/app.jar --server.port=${PORT}"]
