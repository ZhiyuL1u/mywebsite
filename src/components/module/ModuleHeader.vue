<!-- 每个内容模块的title -->

<template>
    <div class="heading">
        <a-row class="color-title"><a-col :span="24"><span >{{title}}</span></a-col></a-row>
        <a-row class="color-content"><a-col :span="24"><h2>{{subTitle}}</h2></a-col></a-row>
    </div>
</template>

<script lang="ts">
    import {Component, Vue} from 'vue-property-decorator';

    @Component({
        props: {
            title: String,
            subTitle: String,
        },
    })
    export default class ModuleHeader extends Vue {
    }
</script>

<style scoped lang="scss">

    .heading {
        border: 2px solid #2b2d30;
        padding: .5em 0 0 1.5em;
        font-family: 'YouSheBiaoTiHei',monospace;

        margin-bottom: 30px;
        background: #1e1f22;




        span {
            font-size: 12px;
            text-transform: uppercase;
            font-weight: 400;
            letter-spacing: 5px;
          text-shadow: 0 0 8px rgba(255, 255, 255, 0.8);

        }

        h2 {
            font-weight: 500;
            font-size: 30px;
            letter-spacing: 3px;
            text-transform: uppercase;
            margin: 0;
          color: white;
          text-shadow: 0 0 8px rgba(255, 255, 255, 0.8);



        }
    }
</style>
